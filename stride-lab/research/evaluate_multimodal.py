"""Exploratory nested leave-one-runner-out evaluation of a pace/HR estimator.
No external-validation claim. Protocol speeds are inferred, not device measurements.
"""
import json,re,collections
from pathlib import Path
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
ROOT=Path(__file__).parent
FAMILIES={'speed':['speed'],'speed_hr':['speed','heart_rate','heart_rate_per_speed'],'speed_hr_profile':['speed','heart_rate','heart_rate_per_speed','age','weight','height']}
ALPHAS=[1,10,100,1000]

def dataset():
    annotations=json.loads((ROOT/'data/labels.json').read_text())['annotations'];unique={};conflicts=0
    selected_views={(r['subject'],r['intensity']):r['view'] for r in json.loads((ROOT/'data/pilot-selection.json').read_text())}
    for r in annotations:
        parts=Path(r['frame_dir']).stem.split('_')
        if len(parts)!=5 or parts[1]!='running':continue
        if selected_views.get((parts[0],parts[2]))!=parts[3]:continue
        start=int(parts[4].split('-')[0])
        if not 300<=start<=1500:continue
        # Zero HR denotes unavailable sensor data, not a physiological reading.
        if not isinstance(r['heart_rate'],(int,float)) or not 30<=r['heart_rate']<=240:continue
        sex=r['sex'];level=parts[2]
        if sex not in (0.,1.) or level not in ['s','m','f']:continue
        # Mapping checked against original sex fields; speed comes from study protocol.
        speed=({'s':8,'m':10,'f':12} if sex==0 else {'s':7,'m':9,'f':11})[level]
        key=(parts[0],level,start)
        row={'subject':parts[0],'speed':speed,'heart_rate':r['heart_rate'],'heart_rate_per_speed':r['heart_rate']/speed,'age':r['age'],'weight':r['weight'],'height':r['height'],'target':r['label']*60/(r['weight']*speed),'time':start}
        if key in unique:
            if any(unique[key][k]!=row[k] for k in ['target','heart_rate','age','weight','height']):conflicts+=1
            continue
        unique[key]=row
    rows=list(unique.values())
    if conflicts:raise RuntimeError(f'{conflicts} conflicting multi-view labels; resolve before fitting')
    if any(not all(np.isfinite(r[k]) for k in ['speed','heart_rate','age','weight','height','target']) or r['target']<=0 for r in rows):raise RuntimeError('Invalid labels')
    return rows

def weights(groups):
    counts=collections.Counter(groups);return np.array([len(groups)/(len(counts)*counts[g]) for g in groups])

def fit(X,y,groups,alpha):
    reg=make_pipeline(StandardScaler(),Ridge(alpha=alpha));reg.fit(X,y,ridge__sample_weight=weights(groups));return reg

def tune(X,y,groups):
    subjects=sorted(set(groups));best=None
    for alpha in ALPHAS:
        errors=[]
        for person in subjects:
            val=groups==person;train=~val
            reg=fit(X[train],y[train],groups[train],alpha)
            errors.append(float(np.mean(np.abs(reg.predict(X[val])-y[val])/y[val])))
        score=float(np.mean(errors))
        if best is None or score<best[0]:best=(score,alpha)
    return best

def summary(y,pred,groups):
    e=np.abs(pred-y);by_runner=[float(np.mean(e[groups==g]/y[groups==g])) for g in sorted(set(groups))]
    return {'runnerMeanRelativeError':float(np.mean(by_runner)),'worstRunnerMeanRelativeError':float(max(by_runner)),'runnerMedianRelativeError':float(np.median(by_runner)),'meanAbsoluteErrorKcalKgKm':float(np.average(e,weights=weights(groups))),'absoluteError90thPercentileKcalKgKm':float(np.quantile(e,.9)),'minimumPrediction':float(np.min(pred)),'maximumPrediction':float(np.max(pred))}

if __name__=='__main__':
    rows=dataset();groups=np.array([r['subject'] for r in rows]);y=np.array([r['target'] for r in rows]);subjects=sorted(set(groups));preds={f:np.zeros(len(y)) for f in FAMILIES};nested=np.zeros(len(y));folds=[]
    for number,person in enumerate(subjects):
        val=groups==person;train=~val;candidates=[]
        for family,names in FAMILIES.items():
            X=np.array([[r[n] for n in names] for r in rows]);score,alpha=tune(X[train],y[train],groups[train]);reg=fit(X[train],y[train],groups[train],alpha)
            preds[family][val]=reg.predict(X[val]);candidates.append((score,family,alpha))
        _,winner,alpha=min(candidates);nested[val]=preds[winner][val];folds.append({'runnerFold':number+1,'selectedFamily':winner,'alpha':alpha,'observations':int(sum(val))})
        print(json.dumps({'fold':number+1,'total':len(subjects),'selected':winner}),flush=True)
    report={'target':'gross energy cost in kcal/kg/km','protocolSpeedSource':'https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2025.1666616/full','protocolSpeedsAreInferred':True,'rowsFromOnePrespecifiedViewPerRunnerIntensity':len(rows),'runners':len(subjects),'validation':'nested leave-one-runner-out; runner-weighted fits and scoring','families':{f:summary(y,p,groups) for f,p in preds.items()},'nestedSelection':summary(y,nested,groups),'folds':folds,'limits':['Exploratory reuse of one dataset; not external validation.','Views with equal filename times can have different metabolic labels; used one prespecified side view per runner/intensity instead of assuming synchronization.','Protocol speeds inferred from sex code and intensity, not measured treadmill-speed records.','300–1500 second windows are assumed exercise; metabolic steady state must be checked.','Rows with unavailable or implausible HR outside 30–240 bpm were excluded before fitting and scoring all models.','Heart rate depends on temperature, fatigue, medication and individual physiology.','Dataset population and treadmill conditions may not match user.','Error percentile is descriptive, not a calibrated prediction interval.'],'deploymentApproved':False}
    report['inputRanges']={n:[float(min(r[n] for r in rows)),float(max(r[n] for r in rows))] for n in ['speed','heart_rate','age','weight','height']}
    (ROOT/'multimodal-evaluation.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='folds'},indent=2))
