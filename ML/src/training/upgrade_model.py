"""Train one candidate with grouped, fold-local calibration; evaluate without tuning on test data."""
import hashlib
import json
import re
import sys
import time
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import precision_score, recall_score, f1_score, brier_score_loss

BASE=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(BASE))
from src.features.model_v2 import build_candidate, normalize_v2
from src.features.text_features import CombinedFeaturePipeline


def group_key(text):
    return re.sub(r'\b\d+\b', '<n>', re.sub(r'https?://\S+|www\.\S+', '<url>', normalize_v2(text)))


def measure(y,p):
    result={}
    for name,cut in [('binary',.5),('warning',.35),('high',.7)]:
        pred=p>=cut
        result[name]={'precision':float(precision_score(y,pred,zero_division=0)), 'recall':float(recall_score(y,pred,zero_division=0)), 'f1':float(f1_score(y,pred,zero_division=0)), 'false_positives':int(sum((y==0)&pred)), 'missed':int(sum((y==1)&~pred))}
    result['brier']=float(brier_score_loss(y,p))
    return result


def main():
    out=BASE/'reports'/'model_upgrade';out.mkdir(parents=True,exist_ok=True)
    train_path=BASE/'data/processed/train.csv';test_path=BASE/'data/processed/test.csv'
    train=pd.read_csv(train_path).dropna(subset=['text']);test=pd.read_csv(test_path).dropna(subset=['text'])
    train['group']=train.text.map(group_key)
    conflicts=train.groupby('group').check.nunique();bad=set(conflicts[conflicts>1].index)
    train=train[~train.group.isin(bad)].drop_duplicates('group').reset_index(drop=True)
    X=train.text.to_numpy();y=train.check.to_numpy()
    folds=list(StratifiedGroupKFold(3,shuffle=True,random_state=42).split(X,y,train.group))
    print(f'Training on {len(train)} unique templates; {len(bad)} conflicting groups excluded. Features fit inside each calibration fold.',flush=True)
    model=CalibratedClassifierCV(build_candidate(),cv=folds,method='sigmoid',ensemble=True,n_jobs=1)
    start=time.time();model.fit(X,y);print(f'Training finished in {time.time()-start:.1f}s',flush=True)
    joblib.dump(model,out/'candidate.pkl',compress=3)
    baseline=joblib.load(BASE/'models/phishing_model.pkl');pipeline=CombinedFeaturePipeline(joblib.load(BASE/'models/tfidf_vectorizer.pkl'))
    probs=[];old=[]
    for i in range(0,len(test),128):
        texts=test.text.iloc[i:i+128].tolist();probs.extend(model.predict_proba(texts)[:,1]);old.extend(baseline.predict_proba(pipeline.transform(texts))[:,1])
    y=test.check.to_numpy();p=np.array(probs);b=np.array(old)
    clean=~test.text.map(group_key).isin(set(train.group)).to_numpy()
    results={'baseline':measure(y,b),'candidate':measure(y,p),'no_train_template_overlap':{'samples':int(sum(clean)),'baseline':measure(y[clean],b[clean]),'candidate':measure(y[clean],p[clean])}}
    results['by_type']={kind:{'baseline':measure(y[test.type==kind],b[test.type==kind]),'candidate':measure(y[test.type==kind],p[test.type==kind])} for kind in test.type.unique()}
    a=results['baseline'];c=results['candidate']
    results['promotion_gate_passed']=bool(c['binary']['f1']>a['binary']['f1'] and c['warning']['recall']>=a['warning']['recall'] and c['warning']['false_positives']<=a['warning']['false_positives'] and results['no_train_template_overlap']['candidate']['binary']['f1']>=results['no_train_template_overlap']['baseline']['binary']['f1'])
    results['training']={'rows':len(train),'conflicting_groups_excluded':len(bad),'folds':3,'seconds':round(time.time()-start,1),'train_sha256':hashlib.sha256(train_path.read_bytes()).hexdigest(),'test_sha256':hashlib.sha256(test_path.read_bytes()).hexdigest()}
    results['limitations']=['Existing historical labels may mix spam and phishing.','No language accuracy claim; local fixtures are synthetic development probes.','Test set used once for candidate comparison, not threshold or hyperparameter tuning.']
    (out/'comparison.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    challenge=json.loads((BASE/'tests/fixtures/local_challenge.json').read_text(encoding='utf-8'))
    cp=model.predict_proba([r['text'] for r in challenge])[:,1]
    (out/'challenge.json').write_text(json.dumps([{**r,'candidate_probability':float(q)} for r,q in zip(challenge,cp)],indent=2),encoding='utf-8')
    print(json.dumps(results,indent=2),flush=True)

if __name__=='__main__':main()
