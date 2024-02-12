export default class TimestampQuery{
  constructor(Device, MaxTimestamps = 64){
    this.Device = Device;
    this.MaxTimestamps = MaxTimestamps;
    this.BufferSize = this.MaxTimestamps * 8;

    this.HasTimestampQueryFeature = this.Device.features.has("timestamp-query");
    if(!this.HasTimestampQueryFeature) return;

    this.QueryBuffer = this.Device.createBuffer({
      "size": this.BufferSize,
      "usage": GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });

    this.QuerySet = this.Device.createQuerySet({
      "type": "timestamp",
      "count": MaxTimestamps
    });

    this.CopyBuffers = [];
  }
  GetCopyBuffer(){
    for(let i = 0; i < this.CopyBuffers.length; ++i){
      if(this.CopyBuffers[i].mapState === "unmapped") return i;
    }
    this.CopyBuffers.push(this.Device.createBuffer({
      "size": this.BufferSize,
      "usage": GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    }));
    return this.CopyBuffers.length - 1;
  }
  RecordTime(StartID, EndID){
    if(!this.HasTimestampQueryFeature) return {};
    
    return {
      "timestampWrites": {
        "querySet": this.QuerySet,
        "beginningOfPassWriteIndex": StartID,
        "endOfPassWriteIndex": EndID,
      },
    };
  }
  Finish(CommandEncoder){
    if(!this.HasTimestampQueryFeature) return;
    CommandEncoder.resolveQuerySet(this.QuerySet, 0, this.MaxTimestamps, this.QueryBuffer, 0);

    const CopyBufferID = this.GetCopyBuffer();
    CommandEncoder.copyBufferToBuffer(
      this.QueryBuffer,
      0, // Source offset
      this.CopyBuffers[CopyBufferID],
      0, // Destination offset
      this.BufferSize
    );
    return CopyBufferID;
  }
  async GetResults(CopyBufferID){
    if(!this.HasTimestampQueryFeature) return null;

    const CopyBuffer = this.CopyBuffers[CopyBufferID];
    await CopyBuffer.mapAsync(
      GPUMapMode.READ,
      0, // Offset
      this.BufferSize // Length
    );
    
    const Temp = CopyBuffer.getMappedRange(0, this.BufferSize);
    const Data = Temp.slice(); // Copy
    CopyBuffer.unmap();

    return new BigInt64Array(Data);
  }
};