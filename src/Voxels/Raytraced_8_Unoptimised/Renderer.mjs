import Converter from "./Converter.mjs";
import AbstractRenderer from "../.Common/AbstractRenderer.mjs";
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

  RenderPass(CommandEncoder, StartID = 0, EndID = 1){
    this.SetUniforms();

    const PassEncoder = CommandEncoder.beginRenderPass({
      "colorAttachments": [
        {
          "view": this.Context.getCurrentTexture().createView(),
          "clearValue": {"r": 0, "g": 0, "b": 0, "a": 1},
          "loadOp": "clear",
          "storeOp": "store"
        }
      ],
      ...this.TimestampQuery.RecordTime(StartID, EndID)
    });
    PassEncoder.setPipeline(this.Pipeline);
    PassEncoder.setBindGroup(0, this.BindGroup);
    PassEncoder.draw(3, 1, 0, 0);
    PassEncoder.end();
  }
};
