// Ashima 3D simplex noise (MIT)
const noise = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`

export const blobVertex = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uFreq;
uniform float uHover;
uniform vec3 uMouse;
varying vec3 vNormal;
varying vec3 vViewPos;
varying float vDisp;
${noise}

float field(vec3 p){
  vec3 q = normalize(p);
  float n = snoise(q * uFreq + vec3(0., uTime * .22, uTime * .1));
  n += .28 * snoise(q * uFreq * 2.1 - vec3(uTime * .15));
  float bulge = smoothstep(.55, 1., dot(q, uMouse)) * uHover;
  return n * uAmp + bulge * .32;
}
vec3 displace(vec3 p){ return p + normalize(p) * field(p); }
vec3 ortho(vec3 v){ return normalize(abs(v.x) > abs(v.z) ? vec3(-v.y, v.x, 0.) : vec3(0., -v.z, v.y)); }

void main(){
  vec3 p = displace(position);
  vec3 t = ortho(normal);
  vec3 b = normalize(cross(normal, t));
  float e = .012;
  vec3 pt = displace(position + t * e);
  vec3 pb = displace(position + b * e);
  vec3 n = normalize(cross(pt - p, pb - p));
  vDisp = field(position);
  vNormal = normalize(normalMatrix * n);
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`

export const blobFragment = /* glsl */ `
uniform float uTime;
uniform float uHue;
uniform vec3 uTint;
uniform float uDim;
varying vec3 vNormal;
varying vec3 vViewPos;
varying float vDisp;

vec3 pal(float t){ return .5 + .5 * cos(6.28318 * (t + vec3(0., .33, .67))); }

void main(){
  vec3 V = normalize(-vViewPos);
  vec3 N = normalize(vNormal);
  float ndv = max(dot(N, V), 0.);
  float fres = pow(1. - ndv, 2.4);
  vec3 R = reflect(-V, N);

  // thin-film style iridescence driven by view angle + displacement
  vec3 irid = pal(ndv * .85 + vDisp * .9 + uHue + uTime * .025);

  // procedural studio environment: soft top light, key strip, side strip
  float env = smoothstep(.1, 1., R.y) * .55
            + exp(-pow((R.y - .18) * 7., 2.)) * 1.1
            + exp(-pow((R.x + .55) * 5., 2.)) * .55 * smoothstep(-.5, .4, R.y);

  vec3 L = normalize(vec3(-.35, .75, .6));
  float spec = pow(max(dot(reflect(-L, N), V), 0.), 64.);

  vec3 col = vec3(.012, .012, .018);
  col += env * mix(vec3(.9), irid, .72) * .55;
  col += irid * fres * 1.15;
  col += uTint * pow(fres, 5.) * 1.4;
  col += spec * 1.2;
  col *= uDim;
  col = col / (1. + col * .6);
  gl_FragColor = vec4(col, 1.);
}`

export const pointsVertex = /* glsl */ `
uniform float uTime;
uniform float uSpread;
uniform float uPixel;
attribute float aSeed;
attribute float aSize;
varying float vAlpha;
varying float vSeed;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main(){
  vec3 p = position;
  float r = length(p);
  p.xz = rot(uTime * (.03 + aSeed * .05) / max(r * .35, .4)) * p.xz;
  p.xy = rot(sin(uTime * .1 + aSeed * 6.28) * .06) * p.xy;
  p *= 1. + uSpread * (.6 + aSeed * 1.2);
  p.y += sin(uTime * .6 + aSeed * 40.) * .04;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixel * (5.5 / -mv.z);
  vAlpha = smoothstep(14., 3., -mv.z) * (.35 + .65 * aSeed);
  vSeed = aSeed;
}`

export const pointsFragment = /* glsl */ `
uniform vec3 uTint;
uniform float uTime;
varying float vAlpha;
varying float vSeed;
void main(){
  vec2 c = gl_PointCoord - .5;
  float d = length(c);
  float a = smoothstep(.5, 0., d);
  a *= a;
  float tw = .6 + .4 * sin(uTime * 2. + vSeed * 90.);
  vec3 col = mix(vec3(.92, .94, 1.), uTint, step(.82, vSeed));
  gl_FragColor = vec4(col, a * vAlpha * tw);
}`
