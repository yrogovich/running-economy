"""Fetch public JSON labels only. Does not deserialize pickle or fetch video."""
import json, zipfile
from pathlib import Path
from inspect_dataset import RemoteZip
with zipfile.ZipFile(RemoteZip()) as z:
    info=z.getinfo('video clips and labels/label.json')
    if info.file_size>8_000_000:raise RuntimeError('Unexpected label size')
    data=json.loads(z.read(info))
path=Path(__file__).parent/'data';path.mkdir(exist_ok=True)
(path/'labels.json').write_text(json.dumps(data))
print('Root:',type(data).__name__,'entries:',len(data))
if isinstance(data,dict):
    value=next(iter(data.values()));print('Value type:',type(value).__name__)
    print('Value fields:',list(value)[:30] if isinstance(value,dict) else str(value)[:300])
elif isinstance(data,list):print('First row fields:',list(data[0]) if isinstance(data[0],dict) else type(data[0]).__name__)
