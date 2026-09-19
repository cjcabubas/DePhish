import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Clock, Fish, GraduationCap, Lock, MessageSquare, Phone, Play } from 'lucide-react';
import { learnModules } from '../data/learnModules';
import { Breadcrumb } from './Breadcrumb';

const icons = { fish: Fish, sms: MessageSquare, phone: Phone };

function flatLessons(module) {
  const out = [];
  module.sections.forEach(section => section.lessons.forEach(lesson => out.push({ ...lesson, section: section.title })));
  return out;
}

function moduleProgress(module) {
  const lessons = flatLessons(module);
  return { total: lessons.length, done: lessons.filter(lesson => lesson.status === 'done').length };
}

function useScrollTop(deps) {
  useEffect(() => { window.scrollTo(0, 0); }, deps);
}

export function Learn() {
  const [route, setRoute] = useState({ step: 'list' });
  const goList = () => setRoute({ step: 'list' });
  const open = moduleId => setRoute({ step: 'overview', moduleId });
  const start = moduleId => {
    const module = learnModules.find(item => item.id === moduleId);
    setRoute({ step: 'module', moduleId, lessonId: module.sections[0].lessons[0].id });
  };
  const pick = (moduleId, lessonId) => setRoute({ step: 'module', moduleId, lessonId });
  const module = learnModules.find(item => item.id === route.moduleId);
  useScrollTop([route.step, route.step === 'module' && route.lessonId]);

  if (route.step === 'list') return <ModuleGrid onOpen={open}/>;
  if (route.step === 'overview') return <ModuleOverview module={module} onBack={goList} onStart={start}/>;
  return <ModulePlayer module={module} lessonId={route.lessonId} onOverview={() => open(module.id)} onPick={pick} onBack={goList}/>;
}

function ModuleGrid({ onOpen }) {
  return <section className="content">
    <Breadcrumb trail={[{ label: 'Learn' }]}/>
    <div className="eyebrow"><span/>CYBERSECURITY AWARENESS</div>
    <h1>Learn to recognize the signs.</h1>
    <p className="lead">Short, practical lessons that help you stay safer online every day. Start with phishing, smishing, or vishing.</p>
    <div className="moduleGrid">
      {learnModules.map(module => {
        const Icon = icons[module.icon];
        const { total } = moduleProgress(module);
        return <button type="button" className={`moduleCard ${module.tone}`} key={module.id} onClick={() => onOpen(module.id)}>
          <span className={`moduleThumb thumb-${module.id}`}><Icon size={46} strokeWidth={1.5}/></span>
          <span className="moduleBody">
            <span className="moduleTop"><span className={`levelBadge ${module.tone}`}>{module.level}</span><span className="moduleProvider">{module.provider}</span></span>
            <span className="moduleType">Course | Self-paced</span>
            <span className="moduleTitle">{module.title}</span>
            <span className="moduleDesc">{module.tagline}</span>
            <span className="moduleFooter"><Clock size={14} aria-hidden="true"/> {module.duration} · {total} lessons</span>
          </span>
        </button>;
      })}
    </div>
  </section>;
}

function ModuleOverview({ module, onBack, onStart }) {
  const Icon = icons[module.icon];
  const { total } = moduleProgress(module);
  return <section className="content narrow">
    <Breadcrumb trail={[{ label: 'Learn', onClick: onBack }, { label: module.title }]}/>
    <div className="modOverview">
      <span className={`moduleBanner thumb-${module.id}`}><Icon size={34} strokeWidth={1.5}/></span>
      <div className="modOverviewHead">
        <span className={`levelBadge ${module.tone}`}>{module.level}</span>
        <h1>{module.title}</h1>
        <p className="lead">{module.tagline}</p>
      </div>
      <div className="infoStrip">
        <span><Lock size={15} aria-hidden="true"/> <b>Free</b></span>
        <span><Clock size={15} aria-hidden="true"/> <b>{module.duration}</b></span>
        <span><GraduationCap size={15} aria-hidden="true"/> <b>{module.level}</b></span>
        <span><Play size={15} aria-hidden="true"/> <b>{total} lessons</b></span>
      </div>
      <div className="modPanel">
        <div className="selfPaced">
          <div>
            <h2>Self-paced</h2>
            <p>Learn on your own schedule. Each module is a short set of lessons you can read in a single sitting.</p>
          </div>
          <button className="primary" onClick={() => onStart(module.id)}>Get Started <ChevronRight size={16} aria-hidden="true"/></button>
        </div>
      </div>
    </div>
  </section>;
}

function ModulePlayer({ module, lessonId, onOverview, onPick, onBack }) {
  const lessons = flatLessons(module);
  const index = Math.max(0, lessons.findIndex(lesson => lesson.id === lessonId));
  const lesson = lessons[index];
  const prev = lessons[index - 1] || null;
  const next = lessons[index + 1] || null;
  const { done, total } = moduleProgress(module);
  const pct = Math.round((done / total) * 100);
  const go = nextId => onPick(module.id, nextId);

  return <section className="moduleLayout">
    <div className="layoutHead">
      <Breadcrumb trail={[{ label: 'Learn', onClick: onBack }, { label: module.title, onClick: onOverview }, { label: lesson.title }]}/>
    </div>
    <aside className="moduleSidebar" aria-label="Course outline">
      <div className="sideHead">
        <span className={`levelBadge ${module.tone}`}>{module.level}</span>
        <h2>{module.title}</h2>
        <p>{done} of {total} lessons complete</p>
        <div className="sideBar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label={`${pct}% complete`}><i style={{ width: `${pct}%` }}/></div>
      </div>
      {module.sections.map((section, sectionIndex) => {
        return <section className="modSection" key={sectionIndex}>
          <h3>{section.title}</h3>
          <ul>{section.lessons.map(lessonItem => {
            const active = lessonItem.id === lesson.id;
            const state = lessonItem.status;
            return <li key={lessonItem.id}>
              <button className={active ? 'active' : ''} onClick={() => go(lessonItem.id)} aria-current={active ? 'step' : undefined}>
                {state === 'done' ? <span className="lessonDone" aria-label="Completed"><Check size={12}/></span>
                  : state === 'current' ? <span className="lessonCurrent" role="img" aria-label="In progress"><i/></span>
                  : <span className="lessonTodo" aria-hidden="true"/>}
                <span className="lessonName">{lessonItem.title}</span>
              </button>
            </li>;
          })}</ul>
        </section>;
      })}
    </aside>
    <article className="lessonStage" aria-live="polite">
      <div className="lessonCard">
        <div className="lessonHead">
          <span className="lessonChip">{lesson.minutes} min</span>
          <h1>{lesson.title}</h1>
          <p>{module.title} · {lesson.section} · Lesson {index + 1} of {total}</p>
        </div>
        {lesson.body.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
        <div className="lessonNav">
          <button className="outline" disabled={!prev} onClick={() => prev && go(prev.id)}><ChevronLeft size={15}/> Previous</button>
          <span className="lessonCount">{index + 1} / {total}</span>
          {next ? <button className="primary" onClick={() => go(next.id)}>Next <ChevronRight size={15}/></button>
            : <button className="primary" onClick={onOverview}>Finish <Check size={15}/></button>}
        </div>
      </div>
    </article>
  </section>;
}