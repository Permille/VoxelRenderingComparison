export default function Convert(OldBuffer, OldBufferSize){
  console.time();
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

  const ZSlices = new Uint32Array(64 * 4);
  const XSlices = new Uint32Array(64 * 4);
  const YSlices = new Uint32Array(64 * 4);

  const PackedZSlicesList = new Uint32Array(64);
  const PackedXSlicesList = new Uint32Array(64);
  const PackedYSlicesList = new Uint32Array(64);

  for(let z512 = 0; z512 < 8; ++z512) for(let x512 = 0; x512 < 8; ++x512) for(let y512 = 0; y512 < 8; ++y512){
    const OldLocation512 = OldData.getUint32((z512 << 6 | x512 << 3 | y512) * 4, true);
    if(OldLocation512 < 2048) continue;

    const NewLocation512 = Allocate(8 * 8 * 8 * 4);
    NewData.setUint32((z512 << 6 | x512 << 3 | y512) * 4, NewLocation512, true);


    for(let z64 = 0; z64 < 8; ++z64) for(let x64 = 0; x64 < 8; ++x64) for(let y64 = 0; y64 < 8; ++y64){
      const OldLocation64 = OldData.getUint32(OldLocation512 + (z64 << 6 | x64 << 3 | y64) * 4, true);
      if(OldLocation64 < 2048) continue;

      // Format for below: Location8's (2048), Slices list lengths (12), Slices list pointers (12)
      // Order: Facing Z, X, Y
      const NewLocation64 = Allocate(8 * 8 * 8 * 4 + 3 * 4 + 3 * 4);
      NewData.setUint32(NewLocation512 + (z64 << 6 | x64 << 3 | y64) * 4, NewLocation64, true);

      // Clear arrays to [63, 0, 63, 0, ...]
      for(let i = 0; i < 256; ++i) ZSlices[i] = XSlices[i] = YSlices[i] = (~i & 1) * 63;

      for(let z8 = 0; z8 < 8; ++z8) for(let x8 = 0; x8 < 8; ++x8) for(let y8 = 0; y8 < 8; ++y8){
        const OldLocation8 = OldData.getUint32(OldLocation64 + (z8 << 6 | x8 << 3 | y8) * 4, true);
        if(OldLocation8 < 2048) continue;
  
        const NewLocation8 = Allocate(8 * 8);
        NewData.setUint32(NewLocation64 + (z8 << 6 | x8 << 3 | y8) * 4, NewLocation8, true);

        for(let i = 0; i < 16; ++i){
          NewData.setUint32(NewLocation8 + i * 4, OldData.getUint32(OldLocation8 + i * 4, true), true);
        }

        for(let z1 = 0; z1 < 8; ++z1) for(let x1 = 0; x1 < 8; ++x1){
          const Bits = NewData.getUint8(NewLocation8 + (z1 << 3 | x1), true);
          const z = z8 << 3 | z1;
          const x = x8 << 3 | x1;
          for(let y1 = 0; y1 < 8; ++y1) if((Bits >> y1) & 1){
            const y = y8 << 3 | y1;

            ZSlices[z << 2 | 0] = Math.min(ZSlices[z << 2 | 0], x);
            ZSlices[z << 2 | 1] = Math.max(ZSlices[z << 2 | 1], x);
            ZSlices[z << 2 | 2] = Math.min(ZSlices[z << 2 | 2], y);
            ZSlices[z << 2 | 3] = Math.max(ZSlices[z << 2 | 3], y);
            
            XSlices[x << 2 | 0] = Math.min(XSlices[x << 2 | 0], y);
            XSlices[x << 2 | 1] = Math.max(XSlices[x << 2 | 1], y);
            XSlices[x << 2 | 2] = Math.min(XSlices[x << 2 | 2], z);
            XSlices[x << 2 | 3] = Math.max(XSlices[x << 2 | 3], z);
            
            YSlices[y << 2 | 0] = Math.min(YSlices[y << 2 | 0], z);
            YSlices[y << 2 | 1] = Math.max(YSlices[y << 2 | 1], z);
            YSlices[y << 2 | 2] = Math.min(YSlices[y << 2 | 2], x);
            YSlices[y << 2 | 3] = Math.max(YSlices[y << 2 | 3], x);
          }
        }
      }

      let ZSlicesCount = 0;
      let XSlicesCount = 0;
      let YSlicesCount = 0;

      for(let i = 0; i < 64; ++i){
        if(ZSlices[i << 2 | 0] <= ZSlices[i << 2 | 1]){
          PackedZSlicesList[ZSlicesCount++] = ZSlices[i << 2 | 3] << 24 | ZSlices[i << 2 | 2] << 18 | ZSlices[i << 2 | 1] << 12 | ZSlices[i << 2 | 0] << 6 | i;
        }
        if(XSlices[i << 2 | 0] <= XSlices[i << 2 | 1]){
          PackedXSlicesList[XSlicesCount++] = XSlices[i << 2 | 3] << 24 | XSlices[i << 2 | 2] << 18 | XSlices[i << 2 | 1] << 12 | XSlices[i << 2 | 0] << 6 | i;
        }
        if(YSlices[i << 2 | 0] <= YSlices[i << 2 | 1]){
          PackedYSlicesList[YSlicesCount++] = YSlices[i << 2 | 3] << 24 | YSlices[i << 2 | 2] << 18 | YSlices[i << 2 | 1] << 12 | YSlices[i << 2 | 0] << 6 | i;
        }
      }

      const ZSlicesLocation = Allocate(ZSlicesCount * 4);
      const XSlicesLocation = Allocate(XSlicesCount * 4);
      const YSlicesLocation = Allocate(YSlicesCount * 4);

      for(let i = 0; i < ZSlicesCount; ++i) NewData.setUint32(ZSlicesLocation + i * 4, PackedZSlicesList[i], true);
      for(let i = 0; i < XSlicesCount; ++i) NewData.setUint32(XSlicesLocation + i * 4, PackedXSlicesList[i], true);
      for(let i = 0; i < YSlicesCount; ++i) NewData.setUint32(YSlicesLocation + i * 4, PackedYSlicesList[i], true);

      NewData.setUint32(NewLocation64 + (512 + 0) * 4, ZSlicesCount, true);
      NewData.setUint32(NewLocation64 + (512 + 1) * 4, XSlicesCount, true);
      NewData.setUint32(NewLocation64 + (512 + 2) * 4, YSlicesCount, true);
      
      NewData.setUint32(NewLocation64 + (515 + 0) * 4, ZSlicesLocation, true);
      NewData.setUint32(NewLocation64 + (515 + 1) * 4, XSlicesLocation, true);
      NewData.setUint32(NewLocation64 + (515 + 2) * 4, YSlicesLocation, true);
    }
  }

  console.log(`Old size: ${OldBufferSize}`);
  console.log(`New size: ${Index}`);
  console.timeEnd();
  return [NewBuffer, Index];
};