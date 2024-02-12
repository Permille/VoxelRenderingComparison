export default class AbstractRenderer{
  Render(){
    const CommandEncoder = this.Device.createCommandEncoder();
    this.RenderPass(CommandEncoder);
    const ID = this.TimestampQuery.Finish(CommandEncoder);
    this.Device.queue.submit([CommandEncoder.finish()]);

    void async function(){
      const TimesArray = await this.TimestampQuery.GetResults(ID);
      if(TimesArray === null) return;
      
      this.StatisticsWindow.Update("RenderTime", Number(TimesArray[1] - TimesArray[0]) * 1e-6);
    }.call(this);
  }
  async Benchmark(Iterations = 100){
    if(Iterations > 512){
      throw new Error("Can do at most 512 iterations.");
    }
    const CommandEncoder = this.Device.createCommandEncoder();
    for(let i = 0; i < Iterations; ++i){
      this.RenderPass(CommandEncoder, i << 1 | 0, i << 1 | 1);
    }
    const ID = this.TimestampQuery.Finish(CommandEncoder);
    this.Device.queue.submit([CommandEncoder.finish()]);

    const TimesArray = await this.TimestampQuery.GetResults(ID);

    let Total = 0n;
    for(let i = 0; i < Iterations; ++i) Total += TimesArray[i << 1 | 1] - TimesArray[i << 1];

    return Number(Total) * 1e-6;
  }
};