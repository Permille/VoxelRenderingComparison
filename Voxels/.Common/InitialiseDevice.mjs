export default async function InitialiseDevice(RequiredLimits){
  if(!window.navigator.gpu) throw new Error("WebGPU is not supported.");
  let Fail = "";
  let Error = null;
  for(let i = 0; i < 5; ++i){
    let Adapter;
    try{
      Adapter = await navigator.gpu.requestAdapter({
        "powerPreference": "high-performance"
      });
      if(Adapter === null){
        throw new Error("Failed to get adapter.");
      }
    } catch(e){
      console.error(`Failed to get WebGPU adapter on attempt ${i}.`, e);
      Fail = "Adapter";
      Error = e;
      continue;
    }
    let Device;
    try{
      Device = await Adapter.requestDevice({
        "requiredLimits": RequiredLimits
      });
    } catch(e){
      console.error(`Failed to get WebGPU device on attempt ${i}.`, e);
      Fail = "Device";
      Error = e;
      continue;
    }
    return Device;
  }
  switch(Fail){
    case "Adapter": throw "Failed to initialise WebGPU adapter after five tries. Your browser or computer may not support WebGPU.\n" + Error;
    case "Device": throw "Failed to initialise WebGPU device after five tries. Your browser or computer may not support WebGPU.\n" + Error;
  }
};