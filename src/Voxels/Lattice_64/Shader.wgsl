struct VertexOut{
  @builtin(position) Position : vec4<f32>,
  @location(0) Region64Position : vec3<f32>,
  @location(1) @interpolate(flat) Region64Coordinate : u32
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

  let ZCount = Data[Location64 + 512];
  let XCount = Data[Location64 + 513];

  let LocalInstanceID = InstanceIndex - InstancesStart;

  let Offset = vec3<f32>(
    (extractBits(vec3<u32>(Coordinate512) >> vec3<u32>(3, 0, 6), 0, 3) << vec3<u32>(9)) |
    (extractBits(vec3<u32>(Coordinate64) >> vec3<u32>(3, 0, 6), 0, 3) << vec3<u32>(6))
  );

  var VertexCoord : vec3<f32>;
  var Normal : u32 = 0;

  var SmallOffset = vec3<f32>(0.);
  if(LocalInstanceID < ZCount){
    // Z side
    
    let SliceInstanceID = LocalInstanceID;

    
    let PackedBounds = Data[(Data[Location64 + 515] >> 2) + SliceInstanceID];
    let Z = f32(PackedBounds & 63) + .5;
    let MinX = f32((PackedBounds >> 6) & 63);
    let MaxX = f32(((PackedBounds >> 12) & 63) + 1);
    let MinY = f32((PackedBounds >> 18) & 63);
    let MaxY = f32(((PackedBounds >> 24) & 63) + 1);

    let Sign = sign(Uniforms.Position.z - Offset.z - Z);
    
    Normal = 2u | select(0u, 4u, Sign < 0.);

    SmallOffset = vec3<f32>(0., 0., .5 * Sign);

    VertexCoord = vec3<f32>(select(MinX, MaxX, (VertexIndex & 1) == 1), select(MinY, MaxY, (VertexIndex >> 1) == 1), Z);
  } else if(LocalInstanceID < ZCount + XCount){
    // X side

    let SliceInstanceID = LocalInstanceID - ZCount;


    let PackedBounds = Data[(Data[Location64 + 516] >> 2) + SliceInstanceID];
    let X = f32(PackedBounds & 63) + .5;
    let MinY = f32((PackedBounds >> 6) & 63);
    let MaxY = f32(((PackedBounds >> 12) & 63) + 1);
    let MinZ = f32((PackedBounds >> 18) & 63);
    let MaxZ = f32(((PackedBounds >> 24) & 63) + 1);

    let Sign = sign(Uniforms.Position.x - Offset.x - X);
    
    Normal = 0u | select(0u, 4u, Sign < 0.);

    SmallOffset = vec3<f32>(.5 * Sign, 0., 0.);

    VertexCoord = vec3<f32>(X, select(MinY, MaxY, (VertexIndex & 1) == 1), select(MinZ, MaxZ, (VertexIndex >> 1) == 1));
  } else{
    // Y side

    let SliceInstanceID = LocalInstanceID - ZCount - XCount;

    
    let PackedBounds = Data[(Data[Location64 + 517] >> 2) + SliceInstanceID];
    let Y = f32(PackedBounds & 63) + .5;
    let MinZ = f32((PackedBounds >> 6) & 63);
    let MaxZ = f32(((PackedBounds >> 12) & 63) + 1);
    let MinX = f32((PackedBounds >> 18) & 63);
    let MaxX = f32(((PackedBounds >> 24) & 63) + 1);

    let Sign = sign(Uniforms.Position.y - Offset.y - Y);
    
    Normal = 1u | select(0u, 4u, Sign < 0.);

    SmallOffset = vec3<f32>(0., .5 * Sign, 0.);

    VertexCoord = vec3<f32>(select(MinX, MaxX, (VertexIndex & 1) == 1), Y, select(MinZ, MaxZ, (VertexIndex >> 1) == 1));
  }


  var Vertex = Uniforms.ModelViewProjection * vec4<f32>(VertexCoord + Offset + SmallOffset, 1.);


  return VertexOut(Vertex, VertexCoord, (Normal << 29) | ChunkIndex);
}

@fragment
fn FragmentMain(VertexData : VertexOut) -> @location(0) vec4<f32>{
  let ChunkIndex = VertexData.Region64Coordinate & 536870911;

  let Coordinate512 = ChunkIndex >> 9;
  let Location512 = Data[Coordinate512] >> 2;
  let Coordinate64 = ChunkIndex & 511;
  let Location64 = Data[Location512 + Coordinate64] >> 2;

  let Region64Position = vec3<u32>(floor(clamp(VertexData.Region64Position, vec3<f32>(0.), vec3<f32>(63.999))));

  let Temp8 = extractBits(Region64Position, 3, 3) << vec3<u32>(3, 0, 6);
  let Coordinate8 = Temp8.x | Temp8.y | Temp8.z;
  let Location8 = Data[Location64 + Coordinate8] >> 2;

  if(Location8 < 512){
    discard;
    return vec4<f32>();
  }

  let Temp1 = extractBits(Region64Position, 0, 3) << vec3<u32>(3, 0, 6);
  let Coordinate1 = Temp1.x | Temp1.y | Temp1.z;
  
  let IsSolid = ((Data[Location8 + (Coordinate1 >> 5)] >> (Coordinate1 & 31)) & 1) == 1;

  if(!IsSolid){
    discard;
    return vec4<f32>();
  }

  let PackedNormal = VertexData.Region64Coordinate >> 29;
  let UnsignedPackedNormal = PackedNormal & 3;
  let Normal = select(-1., 1., PackedNormal > 3) * vec3<f32>(vec3<bool>(UnsignedPackedNormal == 0, UnsignedPackedNormal == 1, UnsignedPackedNormal == 2));
  //return vec4<f32>(Normal * .5 + .5, 1.);
  if(dot(vec3<f32>(1.), Normal) < 0.){
    return vec4<f32>(vec3<f32>(length(abs(Normal) * vec3<f32>(.9, 1., .8))), 1.);
  } else{
    return vec4<f32>(vec3<f32>(length(abs(Normal) * vec3<f32>(.7, .6, .75))), 1.);
  }
}