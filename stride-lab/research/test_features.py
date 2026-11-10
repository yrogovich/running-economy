import unittest
import numpy as np
from evaluate_pilot import features
class FeaturesTest(unittest.TestCase):
    def fixture(self):
        frames=[]
        for i in range(300):
            t=i/30;p=[{'x':.5,'y':.5,'visibility':1.0} for _ in range(33)]
            for side,offset in [(0,-.025),(1,.025)]:
                p[11+side].update(x=.5+offset,y=.25)
                p[23+side].update(x=.5+offset,y=.5)
                p[25+side].update(x=.5+offset+.06*np.sin(2*np.pi*1.4*t+side*np.pi),y=.65)
                p[27+side].update(x=.5+offset+.12*np.sin(2*np.pi*1.4*t+side*np.pi),y=.85)
            frames.append({'t':t,'points':p})
        return {'width':640,'height':480,'frames':frames}
    def test_insufficient_tracking(self):
        d=self.fixture();d['frames']=d['frames'][:50]
        self.assertIsNone(features(d)[0])
    def test_finite_features_and_stride_frequency(self):
        x,coverage=features(self.fixture());self.assertEqual(coverage,1);self.assertTrue(np.isfinite(x).all());self.assertAlmostEqual(x[-2],1.4,places=2)
    def test_horizontal_mirror_invariance(self):
        d=self.fixture();original=features(d)[0]
        for f in d['frames']:
            for p in f['points']:p['x']=1-p['x']
        np.testing.assert_allclose(original,features(d)[0],atol=1e-9)
if __name__=='__main__':unittest.main()
