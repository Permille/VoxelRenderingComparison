import Convert from "./Converter.mjs";
import AbstractRenderer from "../.Common/AbstractRenderer.mjs";
import Quicksort from "../../Libraries/Quicksort.mjs";
import InitialiseDevice from "../.Common/InitialiseDevice.mjs";
import TimestampQuery from "../.Common/TimestampQuery.mjs";
import Shader from "./Shader.wgsl";

export default class Renderer extends AbstractRenderer{
  constructor(){
    super();
    this.Canvas = document.createElement("canvas");
    document.querySelector("#Main").append(this.Canvas);
    this.Context = this.Canvas.getContext("webgpu");
  }
  async Initialise(Buffer, BufferSize, Camera, StatisticsWindow){
    this.Camera = Camera;
    this.StatisticsWindow = StatisticsWindow;

    this.StatisticsWindow.AddGraph("RenderTime", {
      "Title": "Rendering time",
      "Unit": "ms",
      "Colour": "rebeccapurple"
    });

    this.Device = await InitialiseDevice({
      "maxBufferSize": BufferSize,
      "maxStorageBufferBindingSize": BufferSize
    });

    this.TimestampQuery = new TimestampQuery(this.Device, 1024);
    
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

    const Indices = new Uint16Array([0,1,2,3]);
    this.IndexBuffer = this.Device.createBuffer({
      "size": (Indices.byteLength + 3) & ~3,
      "usage": GPUBufferUsage.INDEX,
      "mappedAtCreation": true
    });
    new Uint16Array(this.IndexBuffer.getMappedRange(0, 8)).set(Indices);
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
        "cullMode": "none"
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
  RenderPass(CommandEncoder, StartID = 0, EndID = 1){
    this.SetUniforms();

    const [RenderRegionsLength, TotalInstances, UpdateSize] = this.FrustumCull64s();
    this.Device.queue.writeBuffer(this.RenderListBuffer, 0, this.RenderListArray.buffer, this.RenderListArray.byteOffset, this.RenderListArray.byteLength);

    this.PreviousRenderListLength = RenderRegionsLength;

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
      },
      ...this.TimestampQuery.RecordTime(StartID, EndID)
    });
    PassEncoder.setPipeline(this.Pipeline);
    PassEncoder.setBindGroup(0, this.BindGroup);
    PassEncoder.setIndexBuffer(this.IndexBuffer, "uint16");
    PassEncoder.drawIndexed(4, TotalInstances, 0, 0, 0);
    PassEncoder.end();
  }
  FrustumCull64s(){
    const ChunkSphereRadius = Math.sqrt(3. * (64. ** 2.));
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

      const ZSlicesCount = Data.getUint32(Location64 + 512 * 4, true);
      const XSlicesCount = Data.getUint32(Location64 + 513 * 4, true);
      const YSlicesCount = Data.getUint32(Location64 + 514 * 4, true);

      const TotalSlicesCount = ZSlicesCount + XSlicesCount + YSlicesCount;
      
      RenderListArray[i << 1 | 0] = ChunkIndex;
      RenderListArray[i << 1 | 1] = TotalInstances;

      TotalInstances += TotalSlicesCount;
    }
    
    for(let i = RenderRegionsLength * 2; i < this.PreviousRenderListLength * 2; ++i) RenderListArray[i] = 0xffffffff;
    const UpdateSize = Math.max(RenderRegionsLength, this.PreviousRenderListLength);
    return [RenderRegionsLength, TotalInstances, UpdateSize];
  }
};
