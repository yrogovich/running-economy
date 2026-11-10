"""Participant-separated pilot; results are research evidence, not app predictions."""
import json,collections
from pathlib import Path
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.metrics import mean_absolute_error
ROOT=Path(__file__).parent;DATA=ROOT/'data';CACHE=DATA/'pilot'
NAMES=['hip_vertical_span','hip_vertical_speed','ankle_separation_span','ankle_separation_speed','knee_angle_median','knee_angle_span','trunk_tilt_median','trunk_tilt_span','ankle_vertical_span','ankle_vertical_speed','stride_spectral_hz','stride_spectral_concentration']

def features(data):
    all_frames=data['frames'];valid=[]
    for f in all_frames:
        p=f['points']
        if p and all(np.isfinite([p[i]['x'],p[i]['y'],p[i]['visibility']]).all() and p[i]['visibility']>=.65 for i in [11,12,23,24,25,26,27,28]):valid.append(f)
    coverage=len(valid)/max(1,len(all_frames))
    if coverage<.8 or len(valid)<150:return None,coverage
    aspect=data['width']/data['height'];ts=np.array([f['t'] for f in valid]);p=np.array([[[v['x']*aspect,v['y']] for v in f['points']] for f in valid])
    hip=(p[:,23]+p[:,24])/2;shoulder=(p[:,11]+p[:,12])/2;scale=np.median(np.linalg.norm(shoulder-hip,axis=1))
    if scale<.05:return None,coverage
    consecutive=np.diff(ts)<.06
    span=lambda x:float(np.quantile(x,.95)-np.quantile(x,.05))
    speed=lambda x:float(np.median(np.abs(np.diff(x)[consecutive]/np.diff(ts)[consecutive])))
    hy=hip[:,1]/scale;sep=(p[:,27,0]-p[:,28,0])/scale
    knees=[]
    for a,b,c in [(23,25,27),(24,26,28)]:
        u=p[:,a]-p[:,b];v=p[:,c]-p[:,b]
        knees.append(np.degrees(np.arccos(np.clip(np.sum(u*v,axis=1)/np.maximum(1e-8,np.linalg.norm(u,axis=1)*np.linalg.norm(v,axis=1)),-1,1))))
    trunk=np.degrees(np.arctan2(np.abs(shoulder[:,0]-hip[:,0]),np.abs(shoulder[:,1]-hip[:,1])))
    ankle_y=(p[:,27,1]-p[:,28,1])/scale
    # Lomb-like projection works on observed timestamps without closing missing gaps.
    frequencies=np.arange(.8,2.01,.02);center=sep-np.mean(sep)
    powers=np.array([abs(np.sum(center*np.exp(-2j*np.pi*f*ts)))**2 for f in frequencies])
    dominant=int(np.argmax(powers));total=float(np.sum(powers))
    out=[span(hy),speed(hy),span(sep),speed(sep),float(np.mean([np.median(k) for k in knees])),float(np.mean([span(k) for k in knees])),float(np.median(trunk)),span(trunk),span(ankle_y),speed(ankle_y),float(frequencies[dominant]),float(powers[dominant]/max(total,1e-8))]
    return out,coverage

def metrics(y,pred,groups):
    err=np.abs(y-pred);relative=err/np.maximum(y,1e-8)
    per_subject=[float(np.mean(relative[np.array(groups)==g])) for g in sorted(set(groups))]
    return {'clips':len(y),'participants':len(set(groups)),'maeKcalKgMin':float(np.mean(err)),'meanRelativeError':float(np.mean(relative)),'participantMeanRelativeError':float(np.mean(per_subject)),'worstParticipantMeanRelativeError':max(per_subject),'maxAbsoluteErrorKcalKgMin':float(max(err))}

def tune(X,y,groups):
    best=None
    for alpha in [1,10,100,1000]:
        errors=[]
        for train,val in LeaveOneGroupOut().split(X,y,groups):
            reg=make_pipeline(StandardScaler(),Ridge(alpha=alpha)).fit(X[train],y[train])
            errors.append(mean_absolute_error(y[val],reg.predict(X[val])))
        score=float(np.mean(errors))
        if best is None or score<best[0]:best=(score,alpha)
    return best

if __name__=='__main__':
    selection=json.loads((DATA/'pilot-selection.json').read_text());dataset=[];excluded=[]
    for item in selection:
        path=CACHE/(item['id']+'.poses.json')
        if not path.exists():raise RuntimeError('Pose extraction incomplete; missing '+item['id'])
        vector,coverage=features(json.loads(path.read_text()))
        if vector is None:excluded.append({'id':item['id'],'split':item['split'],'coverage':coverage});continue
        row=item['annotation'];context=[row['weight'],row['height'],row['age'],row['sex'],{'s':0,'m':1,'f':2}[item['intensity']]]
        dataset.append({**item,'features':vector,'coverage':coverage,'context':context,'target':row['label']/row['weight']})
    (DATA/'pilot-features.json').write_text(json.dumps(dataset))
    output={'target':'gross metabolic energy rate, kcal/kg/min (NOT yet running economy)','featureNames':NAMES,'excluded':excluded,'selectionCount':len(selection),'includedCount':len(dataset),'models':{},'limitations':['Exploratory small sample; not clinical validation.','No explicit verified speed field; economy conversion not performed.','First candidate-window selection assumed steady exercise; metabolic steady state not independently confirmed.','Three test runners at most; no population-calibrated prediction interval.','Python CPU extraction may differ from browser GPU extraction.','Intensity category used only for research context baseline; not a verified km/h field.'],'deploymentApproved':False}
    train=[r for r in dataset if r['split']=='train'];y=np.array([r['target'] for r in train]);groups=[r['subject'] for r in train]
    fitted={}
    for family in ['constant','context','pose','context_pose']:
        select=lambda r: r['context'] if family=='context' else r['features'] if family=='pose' else r['context']+r['features']
        if family!='constant':
            X=np.array([select(r) for r in train]);cv,alpha=tune(X,y,groups);model=make_pipeline(StandardScaler(),Ridge(alpha=alpha)).fit(X,y)
            result={'alpha':alpha,'trainingLeaveOneRunnerOutMAE':cv}
        else:result={'trainingMedian':float(np.median(y))}
        fitted[family]=None if family=='constant' else model
        for split in ['valid']:
            held=[r for r in dataset if r['split']==split]
            if not held:raise RuntimeError('No evaluable '+split+' participants')
            actual=np.array([r['target'] for r in held]);pred=np.full(len(held),np.median(y)) if family=='constant' else model.predict(np.array([select(r) for r in held]))
            result[split]=metrics(actual,pred,[r['subject'] for r in held])
        output['models'][family]=result
    selected=min(['pose','context_pose'],key=lambda family:output['models'][family]['valid']['participantMeanRelativeError'])
    output['selectedUsingValidationOnly']=selected
    output['selectionRule']='Choose pose-containing family by validation runner-averaged relative error; alpha tuned only on training runner folds.'
    held=[r for r in dataset if r['split']=='test']
    actual=np.array([r['target'] for r in held]);test_groups=[r['subject'] for r in held]
    for family in ['constant','context',selected]:
        select=lambda r: r['context'] if family=='context' else r['features'] if family=='pose' else r['context']+r['features']
        pred=np.full(len(held),np.median(y)) if family=='constant' else fitted[family].predict(np.array([select(r) for r in held]))
        output['models'][family]['test']=metrics(actual,pred,test_groups)
    output['testPolicy']='Test runners evaluated only for the validation-selected candidate and prespecified baselines. No tuning after test.'
    (ROOT/'pilot-evaluation.json').write_text(json.dumps(output,indent=2));print(json.dumps(output,indent=2))
