
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

  let Temp = vec3<u32>(Data[(Location8 >> 2) + 16]) >> vec3<u32>(6, 0, 12);
  let u_Chunk8MinBounds = extractBits(Temp, 0, 3);
  let u_Chunk8MaxBounds = extractBits(Temp, 3, 3);
  let Chunk8MinBounds = vec3<f32>(u_Chunk8MinBounds);
  let Chunk8MaxBounds = vec3<f32>(u_Chunk8MaxBounds + 1);

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

fn GetVoxel(Chunk8Location : u32, c : vec3<u32>) -> bool{
  return ((Data[Chunk8Location + ((c.z | (c.x >> 5)) & 15)] >> ((c.x | c.y) & 31)) & 1) == 1;
}

const Multiplier = vec3<f32>(1.1920929e-7 * 16., 1.1920929e-7 * 2., 1.1920929e-7 * 4.);

@fragment
fn FragmentMain(VertexData : VertexOut) -> @location(0) vec4<f32>{

  let Chunk8Location = VertexData.Chunk8Location >> 2;

  let Temp = vec3<u32>(Data[Chunk8Location + 16]) >> vec3<u32>(6, 0, 12);
  let u_Chunk8MinBounds = extractBits(Temp, 0, 3);
  let u_Chunk8MaxBounds = extractBits(Temp, 3, 3);
  let Chunk8MinBounds = vec3<f32>(u_Chunk8MinBounds);
  let Chunk8MaxBounds = vec3<f32>(u_Chunk8MaxBounds + 1);

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

  //return vec4<f32>(Mask * RaySign * .5 + .5, 1.);
  let Normal = Mask * RaySign;
  if(dot(vec3<f32>(1.), Normal) < 0.){
    return vec4<f32>(vec3<f32>(length(abs(Normal) * vec3<f32>(.9, 1., .8))), 1.);
  } else{
    return vec4<f32>(vec3<f32>(length(abs(Normal) * vec3<f32>(.7, .6, .75))), 1.);
  }
}




// Slightly faster traversal but it doesn't check if it left the bounding box
/*
@fragment
fn FragmentMain(VertexData : VertexOut) -> @location(0) vec4<f32>{

  let Chunk8Location = VertexData.Chunk8Location >> 2;


  let RayPosition = clamp(VertexData.ChunkPosition, vec3<f32>(0.) + 1e-5, vec3<f32>(8.) - 1e-5);//Uniforms.Position;
  var Mask = vec3<f32>((RayPosition == vec3<f32>(0.) + 1e-5) | (RayPosition == vec3<f32>(8.) - 1e-5));
  var RayPosOffset = vec3<f32>(2. + floor(RayPosition) * Multiplier);
  let RayDirection = VertexData.RayDirection;
  let RaySign = sign(RayDirection);

  var UintPos = bitcast<vec3<u32>>(RayPosOffset);
  
  let RayInverse = 1. / RayDirection;
  let AbsRayInverse = abs(RayInverse);
  
  var SideDistance = (RaySign * .5 + .5 - fract(RayPosition)) * RayInverse;

  if(!GetVoxel(Chunk8Location, UintPos)){
    let RaySignSmall = RaySign * Multiplier;

    for(var i : i32 = 0; i < 4; i = i + 1){
      Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      RayPosOffset = fma(Mask, RaySignSmall, RayPosOffset);
      UintPos = bitcast<vec3<u32>>(RayPosOffset);
      SideDistance = fma(Mask, AbsRayInverse, SideDistance);
      if(GetVoxel(Chunk8Location, UintPos)){
        if(any(vec3<bool>(UintPos & vec3<u32>(0x0000ffc0, 0x0000fff8, 0x0000fff0)))){discard; return vec4<f32>();}
        break;
      }
      
      Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      RayPosOffset = fma(Mask, RaySignSmall, RayPosOffset);
      UintPos = bitcast<vec3<u32>>(RayPosOffset);
      SideDistance = fma(Mask, AbsRayInverse, SideDistance);
      if(GetVoxel(Chunk8Location, UintPos)){
        if(any(vec3<bool>(UintPos & vec3<u32>(0x0000ffc0, 0x0000fff8, 0x0000fff0)))){discard; return vec4<f32>();}
        break;
      }
      
      Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      RayPosOffset = fma(Mask, RaySignSmall, RayPosOffset);
      UintPos = bitcast<vec3<u32>>(RayPosOffset);
      SideDistance = fma(Mask, AbsRayInverse, SideDistance);
      if(any(vec3<bool>(UintPos & vec3<u32>(0x0000ffc0, 0x0000fff8, 0x0000fff0)))){discard; return vec4<f32>();}
      if(GetVoxel(Chunk8Location, UintPos)){ break; }
      
      Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      RayPosOffset = fma(Mask, RaySignSmall, RayPosOffset);
      UintPos = bitcast<vec3<u32>>(RayPosOffset);
      SideDistance = fma(Mask, AbsRayInverse, SideDistance);
      if(GetVoxel(Chunk8Location, UintPos)){
        if(any(vec3<bool>(UintPos & vec3<u32>(0x0000ffc0, 0x0000fff8, 0x0000fff0)))){discard; return vec4<f32>();}
        break;
      }
      
      Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      RayPosOffset = fma(Mask, RaySignSmall, RayPosOffset);
      UintPos = bitcast<vec3<u32>>(RayPosOffset);
      SideDistance = fma(Mask, AbsRayInverse, SideDistance);
      if(GetVoxel(Chunk8Location, UintPos)){
        if(any(vec3<bool>(UintPos & vec3<u32>(0x0000ffc0, 0x0000fff8, 0x0000fff0)))){discard; return vec4<f32>();}
        break;
      }
      
      Mask = step(SideDistance, min(SideDistance.yxy, SideDistance.zzx));
      RayPosOffset = fma(Mask, RaySignSmall, RayPosOffset);
      UintPos = bitcast<vec3<u32>>(RayPosOffset);
      SideDistance = fma(Mask, AbsRayInverse, SideDistance);
      if(any(vec3<bool>(UintPos & vec3<u32>(0x0000ffc0, 0x0000fff8, 0x0000fff0)))){discard; return vec4<f32>();}
      if(GetVoxel(Chunk8Location, UintPos)){ break; }
    }
  }

  //return vec4<f32>(Mask * RaySign * .5 + .5, 1.);
  let Normal = Mask * RaySign;
  if(dot(vec3<f32>(1.), Normal) < 0.){
    return vec4<f32>(vec3<f32>(length(abs(Normal) * vec3<f32>(.9, 1., .8))), 1.);
  } else{
    return vec4<f32>(vec3<f32>(length(abs(Normal) * vec3<f32>(.7, .6, .75))), 1.);
  }
}
*/
