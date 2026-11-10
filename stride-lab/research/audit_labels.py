"""Audit released labels/splits before any model fitting."""
import json, collections
from pathlib import Path
root=Path(__file__).parent
d=json.loads((root/'data/labels.json').read_text())
rows={r['frame_dir']:r for r in d['annotations']}
subject=lambda path:path.split('/')[-1].split('_')[0]
report={'annotationCount':len(d['annotations']),'uniquePaths':len(rows),'splits':{},'participantOverlap':{},'missingVideoPaths':[]}
index=json.loads((root/'dataset-index.json').read_text())
files={i['name'] for i in index['files']}
subjects={}
for split,paths in d['split'].items():
    selected=[rows[p] for p in paths if p in rows and '_running_' in p]
    subjects[split]={subject(r['frame_dir']) for r in selected}
    report['splits'][split]={'runningClips':len(selected),'runningParticipants':len(subjects[split]),'views':dict(collections.Counter(r['frame_dir'].split('_')[-2] for r in selected)),'missingAnnotations':sum(p not in rows for p in paths)}
for a in subjects:
    for b in subjects:
        if a<b:report['participantOverlap'][a+' / '+b]=len(subjects[a]&subjects[b])
report['missingVideoPaths']=[p for p in rows if 'video clips and labels/'+p not in files]
report['labelFields']=list(d['annotations'][0])
report['importantLimits']=['Labels are energy expenditure, not VO2.','No explicit speed field exists in label rows.','Protocol speed, steady-state segment eligibility and unit conversions require verification before economy modelling.','MediaPipe extraction has not yet been evaluated on this dataset.']
(root/'label-audit.json').write_text(json.dumps(report,indent=2))
print(json.dumps({**report,'missingVideoPathsCount':len(report['missingVideoPaths']),'missingVideoPaths':report['missingVideoPaths'][:2]},indent=2))
