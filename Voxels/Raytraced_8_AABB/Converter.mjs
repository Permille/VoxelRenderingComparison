export default function Convert(OldBuffer, OldBufferSize){
  const OldData = new DataView(OldBuffer);
  const NewBuffer = new ArrayBuffer(536870912); // 512 MiB
  const NewData = new DataView(NewBuffer);
  let Index = 0;

  const Allocate = function(Size){
    const Location = Index;
    Index += Size;
    return Location;
  };

  Allocate(8 * 8 * 8 * 4); //Space for Location512's

  for(let z512 = 0; z512 < 8; ++z512) for(let x512 = 0; x512 < 8; ++x512) for(let y512 = 0; y512 < 8; ++y512){
    const OldLocation512 = OldData.getUint32((z512 << 6 | x512 << 3 | y512) * 4, true);
    if(OldLocation512 < 2048) continue;

    const NewLocation512 = Allocate(8 * 8 * 8 * 4);
    NewData.setUint32((z512 << 6 | x512 << 3 | y512) * 4, NewLocation512, true);


    for(let z64 = 0; z64 < 8; ++z64) for(let x64 = 0; x64 < 8; ++x64) for(let y64 = 0; y64 < 8; ++y64){
      const OldLocation64 = OldData.getUint32(OldLocation512 + (z64 << 6 | x64 << 3 | y64) * 4, true);
      if(OldLocation64 < 2048) continue;

      // Format for below: Location8's (2048), not empty Location8's (4), packed list of not empty Location8's (2048)
      const NewLocation64 = Allocate(8 * 8 * 8 * 4 + 4 + 8 * 8 * 8 * 4);
      NewData.setUint32(NewLocation512 + (z64 << 6 | x64 << 3 | y64) * 4, NewLocation64, true);

      let NotEmptyLocation8s = 0;


      for(let z8 = 0; z8 < 8; ++z8) for(let x8 = 0; x8 < 8; ++x8) for(let y8 = 0; y8 < 8; ++y8){
        const OldLocation8 = OldData.getUint32(OldLocation64 + (z8 << 6 | x8 << 3 | y8) * 4, true);
        if(OldLocation8 < 2048) continue;
  
        const NewLocation8 = Allocate(8 * 8);
        NewData.setUint32(NewLocation64 + (z8 << 6 | x8 << 3 | y8) * 4, NewLocation8, true);

        // Add Coordinate8 to not empty list, and increment counter
        NewData.setUint32(NewLocation64 + (513 + NotEmptyLocation8s++) * 4, z8 << 6 | x8 << 3 | y8, true);
  

        for(let i = 0; i < 16; ++i){
          NewData.setUint32(NewLocation8 + i * 4, OldData.getUint32(OldLocation8 + i * 4, true), true);
        }
      }

      // Write the number of non-zero Location8's
      NewData.setUint32(NewLocation64 + 512 * 4, NotEmptyLocation8s, true);
    }
  }

  console.log(`Old size: ${OldBufferSize}`);
  console.log(`New size: ${Index}`);

  return [NewBuffer, Index];
};