"""Fetch one small training-set running clip for pose-pipeline smoke testing."""
import json,zipfile
from pathlib import Path
from inspect_dataset import RemoteZip
root=Path(__file__).parent;labels=json.loads((root/'data/labels.json').read_text());train=set(labels['split']['train'])
row=next(r for r in labels['annotations'] if r['frame_dir'] in train and '_running_m_left_0150-0160' in r['frame_dir'])
with zipfile.ZipFile(RemoteZip()) as z:
    info=z.getinfo('video clips and labels/'+row['frame_dir'])
    if info.file_size>3_000_000:raise RuntimeError('Fixture exceeds 3 MB limit')
    (root/'data/running-fixture.mp4').write_bytes(z.read(info))
(root/'data/fixture-provenance.json').write_text(json.dumps({'dataset':'https://huggingface.co/datasets/zsxm1998/E3V-K5','licenseAsDeclared':'apache-2.0','purpose':'training-split pose smoke test; not accuracy validation','annotation':row},indent=2))
print('Downloaded one training fixture:',info.file_size,'bytes')
