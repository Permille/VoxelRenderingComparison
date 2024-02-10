import Convert from "./Converter.mjs";
import Quicksort from "../../Libraries/Quicksort.mjs";
import InitialiseDevice from "../.Common/InitialiseDevice.mjs";
const Shader = `
struct VertexOut{
  @builtin(position) Position : vec4<f32>,
  @location(0) RayDirection : vec3<f32>,
  @location(1) ChunkPosition : vec3<f32>,
  @location(2) @interpolate(flat) Chunk8Location : u32,
  @location(3) @interpolate(flat) Chunk8BoundsAndLocalCoordinate : u32,
  @location(4) @interpolate(flat) Region64Coordinate : u32
}
struct UniformsStruct{
  ModelViewProjection : mat4x4<f32>,
  Resolution : vec2<f32>,
  FOV : f32,
  Rotation : vec3<f32>,
  Position : vec3<f32>
}

@binding(0) @group(0) var<uniform> Uniforms : UniformsStruct;
@binding(1) @group(0) var<storage, read> Data : array<u32>;
@binding(2) @group(0) var<storage, read> RenderList : array<vec2<u32>, 262144>;

const Vertices = array<u32, 8>(
  630644u,
  81381u,
  822078u,
  272815u,
  1566344u,
  2049049u,
  1241794u,
  1724499u
);

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
fn VertexMain(@builtin(vertex_index) VertexIndex : u32, @builtin(instance_index) InstanceIndex : u32) -> VertexOut{
  var LoadedRegionID : u32 = 0;
  for(var Bit : u32 = 1 << 17; Bit > 0; Bit = Bit >> 1){
    let TryLoadedRegionID = LoadedRegionID | Bit;
    let InstancesStart = RenderList[TryLoadedRegionID].y;
    if(InstancesStart <= InstanceIndex){
      LoadedRegionID = TryLoadedRegionID;
    }
  }
  let RenderInfo = RenderList[LoadedRegionID];
  let ChunkIndex = RenderInfo.x;
  let InstancesStart = RenderInfo.y;

  let Coordinate512 = ChunkIndex >> 9;
  let Location512 = Data[Coordinate512] >> 2;
  let Coordinate64 = ChunkIndex & 511;
  let Location64 = Data[Location512 + Coordinate64] >> 2;

  let NotEmptyChunk8sCount = Data[Location64 + 512];

  let LocalInstanceID = InstanceIndex - InstancesStart;
  
  let Coordinate8 = Data[Location64 + 513 + LocalInstanceID];
  let Location8 = Data[Location64 + Coordinate8];

  let Chunk8MinBounds = vec3<f32>(0.);
  let Chunk8MaxBounds = vec3<f32>(8.);

  let Chunk8Size = Chunk8MaxBounds - Chunk8MinBounds;

  let Coordinate = vec3<f32>(
    (extractBits(vec3<u32>(Coordinate512) >> vec3<u32>(3, 0, 6), 0, 3) << vec3<u32>(9)) |
    (extractBits(vec3<u32>(Coordinate64) >> vec3<u32>(3, 0, 6), 0, 3) << vec3<u32>(6)) |
    (extractBits(vec3<u32>(Coordinate8) >> vec3<u32>(3, 0, 6), 0, 3) << vec3<u32>(3))
  );


  let Sign = u32(dot(vec3<f32>(1.), step(Uniforms.Position, Chunk8MinBounds + Coordinate) * vec3<f32>(4, 2, 1)));
  let ChunkPosition = Chunk8MinBounds + Chunk8Size * vec3<f32>(vec3<u32>(Vertices[Sign] >> (VertexIndex * 3)) & vec3<u32>(4u, 2u, 1u)) * vec3<f32>(.25, .5, 1.);
  let VertexCoord = Coordinate + ChunkPosition;

  var Vertex = Uniforms.ModelViewProjection * vec4<f32>(VertexCoord, 1.);


  return VertexOut(Vertex, VertexCoord - Uniforms.Position, ChunkPosition, Location8, Coordinate8, ChunkIndex);
}

/*
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
*/

fn GetVoxel(Chunk8Location : u32, c : vec3<u32>) -> bool{
  return ((Data[Chunk8Location + ((c.z | (c.x >> 5)) & 15)] >> ((c.x | c.y) & 31)) & 1) == 1;
}

const Multiplier = vec3<f32>(1.1920929e-7 * 16., 1.1920929e-7 * 2., 1.1920929e-7 * 4.);

@fragment
fn FragmentMain(VertexData : VertexOut) -> @location(0) vec4<f32>{

  let Chunk8Location = VertexData.Chunk8Location >> 2;

  let Temp = vec3<u32>(VertexData.Chunk8BoundsAndLocalCoordinate) >> vec3<u32>(9, 15, 21);
  let u_Chunk8MinBounds = extractBits(Temp, 0, 3);
  let u_Chunk8MaxBounds = extractBits(Temp, 3, 3);
  let Chunk8MinBounds = vec3<f32>(0.);//vec3<f32>(u_Chunk8MinBounds);
  let Chunk8MaxBounds = vec3<f32>(8.);//vec3<f32>(u_Chunk8MaxBounds + 1);

  let RayPosition = clamp(VertexData.ChunkPosition, Chunk8MinBounds + 1e-5, Chunk8MaxBounds - 1e-5);//Uniforms.Position;
  var Mask = vec3<f32>((RayPosition == Chunk8MinBounds + 1e-5) | (RayPosition == Chunk8MaxBounds - 1e-5));
  var RayPosOffset = vec3<f32>(2. + floor(RayPosition) * Multiplier);
  let RayDirection = VertexData.RayDirection;
  let RaySign = sign(RayDirection);

  var UintPos = bitcast<vec3<u32>>(RayPosOffset);
  
  let RayInverse = 1. / RayDirection;
  let AbsRayInverse = abs(RayInverse);
  
  var SideDistance = (RaySign * .5 + .5 - fract(RayPosition)) * RayInverse;

  if(!GetVoxel(Chunk8Location, UintPos)){
    let RaySignSmall = RaySign * Multiplier;
    

    //The chunk's bounds, but in floating point format
    let TestChunk8MinBounds = fma(Chunk8MinBounds, Multiplier, vec3<f32>(2.));
    let TestChunk8MaxBounds = fma(Chunk8MaxBounds - 1., Multiplier, vec3<f32>(2.));


    for(var i : i32 = 0; i < 4; i = i + 1){
      Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      RayPosOffset = fma(Mask, RaySignSmall, RayPosOffset);
      UintPos = bitcast<vec3<u32>>(RayPosOffset);
      SideDistance = fma(Mask, AbsRayInverse, SideDistance);
      if(GetVoxel(Chunk8Location, UintPos)){
        if(any((RayPosOffset < TestChunk8MinBounds) | (RayPosOffset > TestChunk8MaxBounds))){discard; return vec4<f32>();}
        break;
      }
      
      Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      RayPosOffset = fma(Mask, RaySignSmall, RayPosOffset);
      UintPos = bitcast<vec3<u32>>(RayPosOffset);
      SideDistance = fma(Mask, AbsRayInverse, SideDistance);
      if(GetVoxel(Chunk8Location, UintPos)){
        if(any((RayPosOffset < TestChunk8MinBounds) | (RayPosOffset > TestChunk8MaxBounds))){discard; return vec4<f32>();}
        break;
      }
      
      Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      RayPosOffset = fma(Mask, RaySignSmall, RayPosOffset);
      UintPos = bitcast<vec3<u32>>(RayPosOffset);
      SideDistance = fma(Mask, AbsRayInverse, SideDistance);
      if(any((RayPosOffset < TestChunk8MinBounds) | (RayPosOffset > TestChunk8MaxBounds))){discard; return vec4<f32>();}
      if(GetVoxel(Chunk8Location, UintPos)){ break; }
      
      Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      RayPosOffset = fma(Mask, RaySignSmall, RayPosOffset);
      UintPos = bitcast<vec3<u32>>(RayPosOffset);
      SideDistance = fma(Mask, AbsRayInverse, SideDistance);
      if(GetVoxel(Chunk8Location, UintPos)){
        if(any((RayPosOffset < TestChunk8MinBounds) | (RayPosOffset > TestChunk8MaxBounds))){discard; return vec4<f32>();}
        break;
      }
      
      Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      RayPosOffset = fma(Mask, RaySignSmall, RayPosOffset);
      UintPos = bitcast<vec3<u32>>(RayPosOffset);
      SideDistance = fma(Mask, AbsRayInverse, SideDistance);
      if(GetVoxel(Chunk8Location, UintPos)){
        if(any((RayPosOffset < TestChunk8MinBounds) | (RayPosOffset > TestChunk8MaxBounds))){discard; return vec4<f32>();}
        break;
      }
      
      Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      RayPosOffset = fma(Mask, RaySignSmall, RayPosOffset);
      UintPos = bitcast<vec3<u32>>(RayPosOffset);
      SideDistance = fma(Mask, AbsRayInverse, SideDistance);
      if(any((RayPosOffset < TestChunk8MinBounds) | (RayPosOffset > TestChunk8MaxBounds))){discard; return vec4<f32>();}
      if(GetVoxel(Chunk8Location, UintPos)){ break; }
    }
  }

  return vec4<f32>(Mask * RaySign * .5 + .5, 1.);
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


    this.RenderListArray = new Uint32Array(64 * 64 * 64 * 2).fill(0xffffffff); //This holds the locations to all Region64's that passed frustum culling
    this.PreviousRenderListLength = this.RenderListArray.length >> 1;
    
    this.RenderListBuffer = this.Device.createBuffer({
      "size": this.RenderListArray.byteLength,
      "usage": GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    const Indices = new Uint16Array([0,1,2,3,4,3,5,1,6]);
    this.IndexBuffer = this.Device.createBuffer({
      "size": (Indices.byteLength + 3) & ~3,
      "usage": GPUBufferUsage.INDEX,
      "mappedAtCreation": true
    });
    new Uint16Array(this.IndexBuffer.getMappedRange(0, 20)).set(Indices);
    this.IndexBuffer.unmap();

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
          "visibility": GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          "buffer": {
            "type": "read-only-storage"
          }
        },
        {
          "binding": 2,
          "visibility": GPUShaderStage.VERTEX,
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
        "topology": "triangle-strip",
        "stripIndexFormat": "uint16",
        "cullMode": "back"
      },
      "depthStencil": {
        "depthWriteEnabled": true,
        "depthCompare": "less",
        "format": "depth24plus"
      }
    });

    const UniformsSize = 256;
    this.UniformDataView = new DataView(new ArrayBuffer(256));
    this.UniformBuffer = this.Device.createBuffer({
      "size": UniformsSize,
      "usage": GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const [ConvertedBuffer, ConvertedSize] = Convert(Buffer, BufferSize);

    this.Buffer = ConvertedBuffer;

    this.DataBuffer = this.Device.createBuffer({
      "size": ConvertedSize,
      "usage": GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    this.Device.queue.writeBuffer(this.DataBuffer, 0, ConvertedBuffer, 0, ConvertedSize);

    this.DepthTexture = null;

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

    if(this.DepthTexture !== null) this.DepthTexture.destroy();
    this.DepthTexture = this.Device.createTexture({
      "size": {"width": Width, "height": Height, "depthOrArrayLayers": 1},
      "format": "depth24plus",
      "usage": GPUTextureUsage.RENDER_ATTACHMENT
    });
    
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
        },
        {
          "binding": 2,
          "resource": {
            "buffer": this.RenderListBuffer
          }
        }
      ]
    });
  }

  SetUniforms(){
    const MVPMatrix = this.Camera.GetModelViewProjectionMatrix(this.Width / this.Height);
    for(let i = 0; i < 16; ++i) this.UniformDataView.setFloat32(i * 4, MVPMatrix[i], true);
    this.UniformDataView.setFloat32(64 + 0, this.Width, true);
    this.UniformDataView.setFloat32(64 + 4, this.Height, true);
    this.UniformDataView.setFloat32(64 + 8, (this.Camera.FOV * Math.PI) / 180., true);
    this.UniformDataView.setFloat32(64 + 16, this.Camera.RotationX, true);
    this.UniformDataView.setFloat32(64 + 20, this.Camera.RotationY, true);
    this.UniformDataView.setFloat32(64 + 24, this.Camera.RotationZ, true);
    this.UniformDataView.setFloat32(64 + 32, this.Camera.PositionX, true);
    this.UniformDataView.setFloat32(64 + 36, this.Camera.PositionY, true);
    this.UniformDataView.setFloat32(64 + 40, this.Camera.PositionZ, true);

    this.Device.queue.writeBuffer(this.UniformBuffer, 0, this.UniformDataView.buffer, this.UniformDataView.byteOffset, this.UniformDataView.byteLength);
  }

  Render(){
    this.SetUniforms();

    const [RenderRegionsLength, TotalInstances, UpdateSize] = this.FrustumCull64s();
    this.Device.queue.writeBuffer(this.RenderListBuffer, 0, this.RenderListArray.buffer, this.RenderListArray.byteOffset, this.RenderListArray.byteLength);

    this.PreviousRenderListLength = RenderRegionsLength;

    const CommandEncoder = this.Device.createCommandEncoder();

    const PassEncoder = CommandEncoder.beginRenderPass({
      "colorAttachments": [
        {
          "view": this.Context.getCurrentTexture().createView(),
          "clearValue": {"r": 0, "g": 0, "b": 0, "a": 1},
          "loadOp": "clear",
          "storeOp": "store"
        }
      ],
      "depthStencilAttachment": {
        "view": this.DepthTexture.createView(),
        "depthClearValue": 1.,
        "depthStoreOp": "store",
        "depthLoadOp": "clear"
      }
    });
    PassEncoder.setPipeline(this.Pipeline);
    PassEncoder.setBindGroup(0, this.BindGroup);
    PassEncoder.setIndexBuffer(this.IndexBuffer, "uint16");
    PassEncoder.drawIndexed(9, TotalInstances, 0, 0, 0);
    PassEncoder.end();

    this.Device.queue.submit([CommandEncoder.finish()]);
  }

  FrustumCull64s(){
    const ChunkSphereRadius = Math.sqrt(3. * (64. / 2.) ** 2.);
    const Data = new DataView(this.Buffer);

    const MVPMatrix = this.Camera.GetModelViewProjectionMatrix(this.Width / this.Height);

    const FrustumPlanes = new Float64Array([
      MVPMatrix[3] + MVPMatrix[0],
      MVPMatrix[7] + MVPMatrix[4],
      MVPMatrix[11] + MVPMatrix[8],
      MVPMatrix[15] + MVPMatrix[12],

      MVPMatrix[3] - MVPMatrix[0],
      MVPMatrix[7] - MVPMatrix[4],
      MVPMatrix[11] - MVPMatrix[8],
      MVPMatrix[15] - MVPMatrix[12],

      MVPMatrix[3] + MVPMatrix[1],
      MVPMatrix[7] + MVPMatrix[5],
      MVPMatrix[11] + MVPMatrix[9],
      MVPMatrix[15] + MVPMatrix[13],

      MVPMatrix[3] - MVPMatrix[1],
      MVPMatrix[7] - MVPMatrix[5],
      MVPMatrix[11] - MVPMatrix[9],
      MVPMatrix[15] - MVPMatrix[13],

      MVPMatrix[3] + MVPMatrix[2],
      MVPMatrix[7] + MVPMatrix[6],
      MVPMatrix[11] + MVPMatrix[10],
      MVPMatrix[15] + MVPMatrix[14],

      MVPMatrix[3] - MVPMatrix[2],
      MVPMatrix[7] - MVPMatrix[6],
      MVPMatrix[11] - MVPMatrix[10],
      MVPMatrix[15] - MVPMatrix[14]
    ]);

    const RenderRegions = new Float64Array(this.RenderListArray.buffer);
    let RenderRegionsLength = 0;

    for(let z512 = 0; z512 < 8; ++z512) for(let x512 = 0; x512 < 8; ++x512) for(let y512 = 0; y512 < 8; ++y512){
      const Location512 = Data.getUint32((z512 << 6 | x512 << 3 | y512) * 4, true);
      if(Location512 < 2048) continue;

      for(let z64 = 0; z64 < 8; ++z64) for(let x64 = 0; x64 < 8; ++x64) Skip: for(let y64 = 0; y64 < 8; ++y64){
        const Location64 = Data.getUint32(Location512 + (z64 << 6 | x64 << 3 | y64) * 4, true);
        if(Location64 < 2048) continue;

        const Region64CoordinateX = x512 << 3 | x64;
        const Region64CoordinateY = y512 << 3 | y64;
        const Region64CoordinateZ = z512 << 3 | z64;

        const X = (Region64CoordinateX + .5) * 64.;
        const Y = (Region64CoordinateY + .5) * 64.;
        const Z = (Region64CoordinateZ + .5) * 64.;

        for(let i = 0; i < 24; i += 4){
          if(X * FrustumPlanes[i + 0] + Y * FrustumPlanes[i + 1] + Z * FrustumPlanes[i + 2] + FrustumPlanes[i + 3] <- ChunkSphereRadius){
            continue Skip; //Not in frustum
          }
        }
        const XDiff = X - this.Camera.PositionX;
        const YDiff = Y - this.Camera.PositionY;
        const ZDiff = Z - this.Camera.PositionZ;

        const Distance = Math.sqrt(XDiff * XDiff + YDiff * YDiff + ZDiff * ZDiff);
        const ChunkIndex = z512 << 15 | x512 << 12 | y512 << 9 | z64 << 6 | x64 << 3 | y64;
        RenderRegions[RenderRegionsLength++] = Math.floor(Distance) * 262144. + ChunkIndex;
      }
    }

    Quicksort(RenderRegions, 0, RenderRegionsLength - 1);
    
    let TotalInstances = 0;
    const RenderListArray = this.RenderListArray;
    
    for(let i = 0; i < RenderRegionsLength; ++i){
      const ChunkIndex = RenderRegions[i] & 262143;
      
      const Coordinate512 = ChunkIndex >> 9;
      const Location512 = Data.getUint32(Coordinate512 * 4, true);
      const Coordinate64 = ChunkIndex & 511;
      const Location64 = Data.getUint32(Location512 + Coordinate64 * 4, true);

      const NotEmptyChunk8sCount = Data.getUint32(Location64 + 512 * 4, true);
      
      RenderListArray[i << 1 | 0] = ChunkIndex;
      RenderListArray[i << 1 | 1] = TotalInstances;

      TotalInstances += NotEmptyChunk8sCount;
    }
    
    for(let i = RenderRegionsLength * 2; i < this.PreviousRenderListLength * 2; ++i) RenderListArray[i] = 0xffffffff;
    const UpdateSize = Math.max(RenderRegionsLength, this.PreviousRenderListLength);
    return [RenderRegionsLength, TotalInstances, UpdateSize];
  }
};
