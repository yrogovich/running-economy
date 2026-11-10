"""Read ZIP directory via HTTP ranges without downloading video or executing pickle.
Usage: python3 research/inspect_dataset.py
"""
import io, json, urllib.request, zipfile
from pathlib import Path
URL='https://huggingface.co/datasets/zsxm1998/E3V-K5/resolve/main/video%20clips%20and%20labels.zip'
class RemoteZip(io.RawIOBase):
    def __init__(self):
        self.pos=0; self.transferred=0
        with urllib.request.urlopen(urllib.request.Request(URL,headers={'Range':'bytes=0-0'}),timeout=30) as r:
            if r.status!=206: raise RuntimeError('Server does not support partial downloads; stopped.')
            self.size=int(r.headers['Content-Range'].split('/')[-1])
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self,offset,whence=0):
        self.pos=offset if whence==0 else self.pos+offset if whence==1 else self.size+offset
        return self.pos
    def read(self,n=-1):
        n=self.size-self.pos if n<0 else min(n,self.size-self.pos)
        if n<=0:return b''
        if n>8_000_000 or self.transferred+n>12_000_000:raise RuntimeError('Metadata download budget exceeded; stopped.')
        req=urllib.request.Request(URL,headers={'Range':f'bytes={self.pos}-{self.pos+n-1}'})
        with urllib.request.urlopen(req,timeout=30) as r:
            expected=f'bytes {self.pos}-{self.pos+n-1}/{self.size}'
            if r.status!=206 or r.headers.get('Content-Range')!=expected:raise RuntimeError('Unexpected HTTP range response; stopped.')
            data=r.read(n+1)
        if len(data)!=n:raise RuntimeError('Incomplete or oversized response')
        self.pos+=n;self.transferred+=n
        return data
if __name__=='__main__':
    source=RemoteZip()
    with zipfile.ZipFile(source) as z:
        index=[{'name':i.filename,'bytes':i.file_size,'compressedBytes':i.compress_size} for i in z.infolist()]
    out=Path(__file__).parent/'dataset-index.json';out.write_text(json.dumps({'url':URL,'archiveBytes':source.size,'metadataBytesFetched':source.transferred,'files':index},indent=2))
    metadata=[i for i in index if not i['name'].lower().endswith(('.mp4','.avi','.mov','/'))]
    print(json.dumps({'entryCount':len(index),'metadataBytesFetched':source.transferred,'nonVideoFiles':metadata[:50]},indent=2))
