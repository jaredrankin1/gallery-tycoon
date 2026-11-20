"""Slices Duane Kowalski, the security guard, from Jared's sheet (art/source/guard.png).
Usage: python3 tools/slice_guard.py art/source/guard.png src/assets/sprites
Prints the sprites.json entry. Boxes are hand-placed on the 1774x887 sheet."""
import sys,json
from PIL import Image
import numpy as np
src,outdir=sys.argv[1],sys.argv[2]
im=Image.open(src).convert('RGBA')
B={
 'idle':[(598,15,708,302)],
 'walk':[(352,318,446,480),(446,318,540,480),(540,318,634,480),(634,318,726,480),(726,318,832,480)],
 'segway':[(358,486,458,658),(482,486,580,658),(606,486,702,658),(732,486,836,658)],
 'radio':[(318,672,452,876)],
 'point':[(450,672,598,876)],
 'whistle':[(598,672,716,876)],
 'flashlight':[(720,672,872,876)],
 'donut':[(870,672,1003,876)],
 'think':[(1003,672,1125,876)],
 'sleep':[(1135,672,1295,876)],
 'alarmed':[(1312,672,1450,876)],
}
def clean(c):
  a=np.array(c).astype(np.int32)
  al=a[...,3]
  al[al<170]=0; al[al>=170]=255
  # strip fringe: saturated red/yellow pixels touching transparency (anti-alias halo), twice
  for _ in range(2):
    t=al==0
    edge=np.zeros_like(t)
    edge[1:]|=t[:-1];edge[:-1]|=t[1:];edge[:,1:]|=t[:,:-1];edge[:,:-1]|=t[:,1:]
    r,g,b=a[...,0],a[...,1],a[...,2]
    mx=np.maximum(np.maximum(r,g),b);mn=np.minimum(np.minimum(r,g),b)
    sat=(mx-mn)/np.maximum(mx,1)
    halo=edge&(al>0)&(sat>0.55)&(mx>150)&(b<mx*0.6)
    al[halo]=0
  a[...,3]=al
  return Image.fromarray(a.astype(np.uint8))
def largest(c):
  # keep only the largest connected blob(s) of opacity (drop neighbour bleed): flood from the bbox-centre column
  a=np.array(c);m=a[...,3]>0;h,w=m.shape
  lab=np.zeros(m.shape,int);cur=0;sizes={}
  for y in range(h):
    for x in range(w):
      if m[y,x] and not lab[y,x]:
        cur+=1;st=[(y,x)];lab[y,x]=cur;n=0
        while st:
          yy,xx=st.pop();n+=1
          for dy,dx in((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
            ny,nx=yy+dy,xx+dx
            if 0<=ny<h and 0<=nx<w and m[ny,nx] and not lab[ny,nx]:
              lab[ny,nx]=cur;st.append((ny,nx))
        sizes[cur]=n
  big=max(sizes.values())
  keep=[k for k,v in sizes.items() if v>=big*0.04]
  a[...,3]=np.where(np.isin(lab,keep),a[...,3],0)
  return Image.fromarray(a)
frames={}
for k,bs in B.items():
  frames[k]=[]
  for b in bs:
    c=largest(clean(im.crop(b)));bb=c.getbbox();frames[k].append(c.crop(bb))
# The turnaround is drawn bigger than the game frames: bring it to the standing action poses' height.
std=frames['radio'][0].height
print({k:[f.height for f in v] for k,v in frames.items()})
f=frames['idle'][0];frames['idle'][0]=f.resize((round(f.width*std/f.height),std),Image.LANCZOS)
# The walk and segway rows are drawn about 15% smaller than the action poses (compare the caps).
for k in ('walk','segway'):
  frames[k]=[f.resize((round(f.width*1.17),round(f.height*1.17)),Image.LANCZOS) for f in frames[k]]
# Half size: the game draws him about 68px tall, so this is still plenty for a 3x screen.
HALF=0.5
frames={k:[f.resize((max(1,round(f.width*HALF)),max(1,round(f.height*HALF))),Image.LANCZOS) for f in v] for k,v in frames.items()}
std=round(std*HALF)
W=max(f.width for v in frames.values() for f in v);H=max(f.height for v in frames.values() for f in v)
maxn=max(len(v) for v in frames.values())
atlas=Image.new('RGBA',(W*maxn,H*len(frames)),(0,0,0,0))
anims={}
for r,(k,v) in enumerate(frames.items()):
  anims[k]=[r,len(v)]
  for i,f in enumerate(v):
    # feet on the bottom edge, figure centred on its body (walk frames centre fine)
    atlas.alpha_composite(f,(i*W+(W-f.width)//2,r*H+H-f.height))
atlas.save(f'{outdir}/guard.png',optimize=True)
# portrait: first emote face
p=largest(clean(im.crop((1150,12,1290,142))));p=p.crop(p.getbbox());p=p.resize((p.width//2,p.height//2),Image.LANCZOS);p.save(f'{outdir}/guard-portrait.png',optimize=True)
# reference height: idle (standing) figure height
# ref leaves headroom above the cap, like the visitor sheets' cells, so he stands as tall as everyone else.
print(json.dumps({'cell':[W,H],'ref':round(std*1.125),'anims':anims}))
