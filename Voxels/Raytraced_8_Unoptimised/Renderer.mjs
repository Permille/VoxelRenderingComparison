import Converter from "./Converter.mjs";
import InitialiseDevice from "../.Common/InitialiseDevice.mjs";
const Shader = `
struct VertexOut{
  @builtin(position) Position : vec4<f32>,
  @location(1) RayDirection : vec3<f32>
}
struct UniformsStruct{
  Resolution : vec2<f32>,
  FOV : f32,
  Rotation : vec3<f32>,
  Position : vec3<f32>
}

@binding(0) @group(0) var<uniform> Uniforms : UniformsStruct;
@binding(1) @group(0) var<storage, read> Data : array<u32>;

fn RotateX(a : f32) -> mat3x3<f32>{
  let c = cos(a);
  let s = sin(a);
  return mat3x3<f32>(1., 0., 0., 0., c, -s, 0., s, c);
}
fn RotateY(a : f32) -> mat3x3<f32>{
  let c = cos(a);
  let s = sin(a);
  return mat3x3<f32>(c, 0., s, 0., 1., 0., -s, 0., c);
}
fn RotateZ(a : f32) -> mat3x3<f32>{
  let c = cos(a);
  let s = sin(a);
  return mat3x3<f32>(c, s, 0., -s, c, 0., 0., 0., 1.);
}

@vertex
fn VertexMain(@builtin(vertex_index) VertexIndex : u32) -> VertexOut{
  var Position = array<vec2<f32>, 3>(
    vec2<f32>(3., -1.),
    vec2<f32>(-1., 3.),
    vec2<f32>(-1., -1.)
  );
  let Vertex = Position[VertexIndex];
  var RayDirection = vec3<f32>(-Vertex.x * (Uniforms.Resolution.x / Uniforms.Resolution.y), Vertex.y, 1. / tan(Uniforms.FOV / 2.));
  RayDirection *= RotateX(Uniforms.Rotation.y);
  RayDirection *= RotateY(3.14159 - Uniforms.Rotation.x);
  return VertexOut(vec4(Vertex, 0., 1.), RayDirection);
}


@fragment
fn FragmentMain(VertexData : VertexOut) -> @location(0) vec4<f32>{
  let RayOrigin = Uniforms.Position / 512.;
  
  let RayDirection = VertexData.RayDirection;
  let AbsRayInverse = abs(1. / RayDirection);
  let RaySign = sign(RayDirection);
  var Mask = vec3<f32>(0.);
  var Hit = false;
  
  var MapPositions : array<vec3<f32>, 4>;
  var SideDistances : array<vec3<f32>, 4>;
  var RayOrigins : array<vec3<f32>, 4>;
  var Locations : array<u32, 4>;
  var Level : u32 = 0;
  MapPositions[0] = floor(RayOrigin);
  SideDistances[0] = (RaySign * (MapPositions[0] - RayOrigin) + (RaySign * .5) + .5) * AbsRayInverse;
  RayOrigins[0] = RayOrigin;
  Locations[0] = 0;

  var i : u32 = 0u;

  for(; i < 2560; i++){
    let u_Position = vec3<u32>(vec3<i32>(MapPositions[Level]));
    if(any(vec3<bool>(u_Position & vec3<u32>(0xfffffff8)))){ //Out of bounds
      Level -= 1;
      if(Level == 0xffffffff){
        break;
      }
      continue;
    }

    if(Level != 3){
      let Location = Data[Locations[Level] + ((u_Position.z << 6) | (u_Position.x << 3) | u_Position.y)] >> 2;

      if(Location > 511){
        let Distance = dot(SideDistances[Level] - AbsRayInverse, Mask);
        let CurrentRayPosition = RayOrigins[Level] + RayDirection * Distance + (RaySign * Mask * 5e-7);

        let OldMapPosition = MapPositions[Level];

        
        let _Mask = step(SideDistances[Level], min(SideDistances[Level].yxy, SideDistances[Level].zzx));
        SideDistances[Level] = fma(_Mask, AbsRayInverse, SideDistances[Level]);
        MapPositions[Level] = fma(_Mask, RaySign, MapPositions[Level]);
        
        Level += 1;

        RayOrigins[Level] = saturate(CurrentRayPosition - OldMapPosition) * 7.99999;//clamp((CurrentRayPosition - OldMapPosition) * vec3<f32>(8.), vec3<f32>(0.), vec3<f32>(7.9999));
        MapPositions[Level] = floor(RayOrigins[Level]);
        Locations[Level] = Location;
        SideDistances[Level] = (RaySign * (MapPositions[Level] - RayOrigins[Level]) + (RaySign * .5) + .5) * AbsRayInverse;
        
        continue;
      }
    } else{
      let IsSolid = (Data[Locations[Level] + ((u_Position.z << 1) | (u_Position.x >> 2))] >> ((u_Position.x << 3) | u_Position.y)) & 1;

      if(IsSolid == 1){
        Hit = true;
        break;
      }
    }
    
    
    Mask = step(SideDistances[Level], min(SideDistances[Level].yxy, SideDistances[Level].zzx));
    SideDistances[Level] = fma(Mask, AbsRayInverse, SideDistances[Level]);
    MapPositions[Level] = fma(Mask, RaySign, MapPositions[Level]);
  }

  if(Hit){
    return vec4<f32>(Mask * RaySign * .5 + .5 /* vec3<f32>(f32(i) / 512.) */, 1.);
  } else{
    return vec4<f32>(0., 0., 0., 1.);
  }
}
`;

export default class Renderer{
  constructor(){
    this.Canvas = document.createElement("canvas");
    document.querySelector("#Main").append(this.Canvas);
    this.Context = this.Canvas.getContext("webgpu");
  }
  async Initialise(Buffer, BufferSize, Camera){
    this.Camera = Camera;
    this.Device = await InitialiseDevice({
      "maxBufferSize": BufferSize,
      "maxStorageBufferBindingSize": BufferSize
    });
    
    this.PresentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.Context.configure({
      "device": this.Device,
      "format": this.PresentationFormat,
      "alphaMode": "premultiplied"
    });

    this.ShaderModule = this.Device.createShaderModule({"code": Shader});

    this.BindGroupLayout = this.Device.createBindGroupLayout({
      "entries": [
        {
          "binding": 0,
          "visibility": GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          "buffer": {
            "type": "uniform"
          }
        },
        {
          "binding": 1,
          "visibility": GPUShaderStage.FRAGMENT,
          "buffer": {
            "type": "read-only-storage"
          }
        }
      ]
    });

    this.Pipeline = this.Device.createRenderPipeline({
      "layout": this.Device.createPipelineLayout({
        "bindGroupLayouts": [this.BindGroupLayout]
      }),
      "vertex": {
        "module": this.ShaderModule,
        "entryPoint": "VertexMain"
      },
      "fragment": {
        "module": this.ShaderModule,
        "entryPoint": "FragmentMain",
        "targets": [
          {
            "format": this.PresentationFormat
          }
        ]
      },
      "primitive": {
        "topology": "triangle-list",
        "cullMode": "back"
      }
    });

    const UniformsSize = 256;
    this.UniformDataView = new DataView(new ArrayBuffer(256));
    this.UniformBuffer = this.Device.createBuffer({
      "size": UniformsSize,
      "usage": GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.DataBuffer = this.Device.createBuffer({
      "size": BufferSize,
      "usage": GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.Device.queue.writeBuffer(this.DataBuffer, 0, Buffer, 0, BufferSize);

    //This calls this.Resize immediately, and whenever the window is resized.
    window.addEventListener("resize", function Load(){
      this.Resize(window.innerWidth, window.innerHeight);
      return Load.bind(this);
    }.call(this));

    return this;
  }

  Resize(Width, Height){
    this.Width = Width | 0;
    this.Height = Height | 0;
    this.Canvas.width = this.Width;
    this.Canvas.height = this.Height;
    this.Canvas.style.width = "100%";
    this.Canvas.style.height = "100%";
    
    this.BindGroup = this.Device.createBindGroup({
      "layout": this.Pipeline.getBindGroupLayout(0),
      "entries": [
        {
          "binding": 0,
          "resource": {
            "buffer": this.UniformBuffer
          }
        },
        {
          "binding": 1,
          "resource": {
            "buffer": this.DataBuffer
          }
        }
      ]
    });
  }

  SetUniforms(){
    this.UniformDataView.setFloat32(0, this.Width, true);
    this.UniformDataView.setFloat32(4, this.Height, true);
    this.UniformDataView.setFloat32(8, (this.Camera.FOV * Math.PI) / 180., true);
    this.UniformDataView.setFloat32(16, this.Camera.RotationX, true);
    this.UniformDataView.setFloat32(20, this.Camera.RotationY, true);
    this.UniformDataView.setFloat32(24, this.Camera.RotationZ, true);
    this.UniformDataView.setFloat32(32, this.Camera.PositionX, true);
    this.UniformDataView.setFloat32(36, this.Camera.PositionY, true);
    this.UniformDataView.setFloat32(40, this.Camera.PositionZ, true);

    this.Device.queue.writeBuffer(this.UniformBuffer, 0, this.UniformDataView.buffer, this.UniformDataView.byteOffset, this.UniformDataView.byteLength);
  }

  Render(){
    this.SetUniforms();

    const CommandEncoder = this.Device.createCommandEncoder();

    const PassEncoder = CommandEncoder.beginRenderPass({
      "colorAttachments": [
        {
          "view": this.Context.getCurrentTexture().createView(),
          "clearValue": {"r": 0, "g": 0, "b": 0, "a": 1},
          "loadOp": "clear",
          "storeOp": "store"
        }
      ]
    });
    PassEncoder.setPipeline(this.Pipeline);
    PassEncoder.setBindGroup(0, this.BindGroup);
    PassEncoder.draw(3, 1, 0, 0);
    PassEncoder.end();

    this.Device.queue.submit([CommandEncoder.finish()]);
  }
};
