"""Bounded feasibility experiment; never publishes model weights to the app.
Downloads at most 70 side-view training/validation/test clips (3 MB each),
extracts the same full MediaPipe pose model, and evaluates unseen runners.
"""
import json,hashlib,collections,zipfile,time,urllib.request,argparse
from pathlib import Path
import numpy as np
import cv2
import mediapipe as mp
from inspect_dataset import RemoteZip
ROOT=Path(__file__).parent
DATA=ROOT/'data'; CACHE=DATA/'pilot';CACHE.mkdir(exist_ok=True)
MODEL=DATA/'pose_landmarker_full.task'

def selection():
    source=json.loads((DATA/'labels.json').read_text())
    split_by_path={p:s for s,paths in source['split'].items() for p in paths}
    groups=collections.defaultdict(list)
    for r in source['annotations']:
        path=r['frame_dir'];parts=Path(path).stem.split('_')
        if len(parts)!=5 or parts[1]!='running' or parts[3] not in ('left','right'):continue
        start=int(parts[4].split('-')[0])
        if not 300<=start<=1500:continue
        groups[(parts[0],parts[2])].append((start,r))
    chosen=[]
    for (subject,intensity),rows in sorted(groups.items()):
        # Keep one camera direction per participant/intensity; two separated times.
        view='left' if any('_left_' in r['frame_dir'] for _,r in rows) else 'right'
        rows=[(t,r) for t,r in rows if '_'+view+'_' in r['frame_dir']]
        used=set()
        for target in (360,960):
            _,row=min(rows,key=lambda tr:abs(tr[0]-target))
            if row['frame_dir'] in used:continue
            used.add(row['frame_dir']);key=hashlib.sha256(row['frame_dir'].encode()).hexdigest()[:16]
            chosen.append({'id':key,'subject':subject,'intensity':intensity,'view':view,'split':split_by_path[row['frame_dir']],'annotation':row})
    if len(chosen)>70:raise RuntimeError('Pilot selection exceeded 70 clip budget')
    return chosen

def fetch(chosen):
    # Reset byte budget for each clip while maintaining the remote ZIP directory.
    remote=RemoteZip()
    with zipfile.ZipFile(remote) as archive:
        for n,item in enumerate(chosen):
            dest=CACHE/(item['id']+'.mp4')
            if dest.exists():continue
            remote.transferred=0
            info=archive.getinfo('video clips and labels/'+item['annotation']['frame_dir'])
            if info.file_size>3_000_000:raise RuntimeError('Clip exceeds download budget')
            blob=archive.read(info);temp=dest.with_suffix('.tmp');temp.write_bytes(blob);temp.replace(dest)
            print(json.dumps({'stage':'download','done':n+1,'total':len(chosen),'bytes':len(blob)}),flush=True)
    if not MODEL.exists():
        with urllib.request.urlopen('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',timeout=30) as response:
            blob=response.read(15_000_001)
        if len(blob)>15_000_000:raise RuntimeError('Unexpected model size')
        MODEL.write_bytes(blob)

def extract(chosen):
    options=mp.tasks.vision.PoseLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=str(MODEL)),running_mode=mp.tasks.vision.RunningMode.VIDEO,num_poses=1,min_pose_detection_confidence=.6,min_pose_presence_confidence=.6,min_tracking_confidence=.6)
    for n,item in enumerate(chosen):
        dest=CACHE/(item['id']+'.poses.json')
        if dest.exists():continue
        capture=cv2.VideoCapture(str(CACHE/(item['id']+'.mp4')))
        fps=capture.get(cv2.CAP_PROP_FPS);width=capture.get(cv2.CAP_PROP_FRAME_WIDTH);height=capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
        if fps<=0:raise RuntimeError('Invalid video FPS')
        frames=[];index=0
        with mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
            while True:
                ok,frame=capture.read()
                if not ok:break
                t=index/fps
                if t>=10:break
                image=mp.Image(image_format=mp.ImageFormat.SRGB,data=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB))
                result=detector.detect_for_video(image,round(t*1000))
                points=[{'x':p.x,'y':p.y,'z':p.z,'visibility':p.visibility} for p in result.pose_landmarks[0]] if result.pose_landmarks else None
                frames.append({'t':t,'points':points});index+=1
        capture.release()
        temp=dest.with_suffix('.tmp');temp.write_text(json.dumps({'width':width,'height':height,'fps':fps,'frames':frames}));temp.replace(dest)
        print(json.dumps({'stage':'pose','done':n+1,'total':len(chosen),'frames':len(frames)}),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--stage',choices=['select','fetch','extract','all'],default='select');args=parser.parse_args()
    chosen=selection();(DATA/'pilot-selection.json').write_text(json.dumps(chosen,indent=2))
    print(json.dumps({'clips':len(chosen),'splits':dict(collections.Counter(i['split'] for i in chosen)),'participants':len(set(i['subject'] for i in chosen))}),flush=True)
    if args.stage in ('fetch','all'):fetch(chosen)
    if args.stage in ('extract','all'):extract(chosen)
