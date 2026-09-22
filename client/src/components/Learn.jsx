import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock, Fish, GraduationCap, Lock, MessageSquare, Phone, Play, RotateCcw, X } from 'lucide-react';
import { learnModules } from '../data/learnModules';
import { Breadcrumb } from './Breadcrumb';
import { api } from '../services/api';

const icons = { fish: Fish, sms: MessageSquare, phone: Phone };
const PASS_THRESHOLD = 75; // % score to pass a section quiz

// ─── Helpers ────────────────────────────────────────────────────────────────

function flatLessons(module) {
  const out = [];
  module.sections.forEach(section =>
    section.lessons.forEach(lesson => out.push({ ...lesson, section: section.title }))
  );
  return out;
}

function totalLessons(module) { return flatLessons(module).length; }

// Count completed lessons from live progress state
function countDone(module, progress) {
  const modProg = progress.find(m => m.moduleId === module.id);
  if (!modProg) return 0;
  return flatLessons(module).filter(l => modProg.completedLessons.includes(l.id)).length;
}

function sectionPassed(module, sectionIndex, progress) {
  const modProg = progress.find(m => m.moduleId === module.id);
  if (!modProg) return false;
  const sec = modProg.sections.find(s => s.sectionIndex === sectionIndex);
  return sec?.passed ?? false;
}

function allSectionLessonsDone(module, sectionIndex, progress) {
  const modProg = progress.find(m => m.moduleId === module.id);
  if (!modProg) return false;
  const lessonIds = module.sections[sectionIndex].lessons.map(l => l.id);
  return lessonIds.every(id => modProg.completedLessons.includes(id));
}

// ─── Progress state management ──────────────────────────────────────────────

function markLessonDone(progress, moduleId, lessonId) {
  const existing = progress.find(m => m.moduleId === moduleId);
  if (existing) {
    if (existing.completedLessons.includes(lessonId)) return progress;
    return progress.map(m =>
      m.moduleId === moduleId
        ? { ...m, completedLessons: [...m.completedLessons, lessonId] }
        : m
    );
  }
  return [...progress, { moduleId, completedLessons: [lessonId], sections: [], startedAt: new Date().toISOString(), completedAt: null }];
}

function recordQuizAttempt(progress, moduleId, sectionIndex, score) {
  const passed = score >= PASS_THRESHOLD;
  const attempt = { score, passed, attemptedAt: new Date().toISOString() };
  const ensureModule = prog => {
    if (prog.find(m => m.moduleId === moduleId)) return prog;
    return [...prog, { moduleId, completedLessons: [], sections: [], startedAt: new Date().toISOString(), completedAt: null }];
  };
  const base = ensureModule(progress);
  return base.map(m => {
    if (m.moduleId !== moduleId) return m;
    const existing = m.sections.find(s => s.sectionIndex === sectionIndex);
    const newAttempts = [...(existing?.quizAttempts ?? []), attempt];
    const bestScore = Math.max(...newAttempts.map(a => a.score));
    const updatedSection = { sectionIndex, quizAttempts: newAttempts, bestScore, passed: bestScore >= PASS_THRESHOLD };
    const sections = existing
      ? m.sections.map(s => s.sectionIndex === sectionIndex ? updatedSection : s)
      : [...m.sections, updatedSection];
    return { ...m, sections };
  });
}

// ─── Scroll helper ──────────────────────────────────────────────────────────

function useScrollTop(deps) {
  useEffect(() => { window.scrollTo(0, 0); }, deps);
}

// ─── Root component ─────────────────────────────────────────────────────────

export function Learn({ user }) {
  const [route, setRoute] = useState({ step: 'list' });
  const [progress, setProgress] = useState([]);
  const saveTimer = useRef(null);

  // Load saved progress once on mount — user is guaranteed logged in by the time this renders
  useEffect(() => {
    api.learn.getProgress().then(modules => {
      if (modules) setProgress(modules);
    }).catch(() => {});
  }, [user?._id]); // reload if the user identity changes (e.g. re-login)

  // Debounced save to server (500 ms after last change)
  const persistProgress = useCallback(modules => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.learn.saveProgress(modules).catch(() => {});
    }, 500);
  }, []);

  const updateProgress = useCallback(updater => {
    setProgress(prev => {
      const next = updater(prev);
      persistProgress(next);
      return next;
    });
  }, [persistProgress]);

  const goList = () => setRoute({ step: 'list' });
  const open = moduleId => setRoute({ step: 'overview', moduleId });
  const start = moduleId => {
    const module = learnModules.find(m => m.id === moduleId);
    setRoute({ step: 'module', moduleId, lessonId: module.sections[0].lessons[0].id });
  };
  const pick = (moduleId, lessonId) => setRoute({ step: 'module', moduleId, lessonId });
  const quiz = (moduleId, sectionIndex) => setRoute({ step: 'quiz', moduleId, sectionIndex });

  const module = learnModules.find(m => m.id === route.moduleId);
  useScrollTop([route.step, route.step === 'module' && route.lessonId]);

  if (route.step === 'list') return <ModuleGrid progress={progress} onOpen={open}/>;
  if (route.step === 'overview') return <ModuleOverview module={module} progress={progress} onBack={goList} onStart={start}/>;
  if (route.step === 'quiz') return (
    <SectionQuiz
      module={module}
      sectionIndex={route.sectionIndex}
      progress={progress}
      onDone={(score) => {
        updateProgress(p => recordQuizAttempt(p, module.id, route.sectionIndex, score));
        // After quiz, return to module player at first lesson of next section (if any)
        const nextSection = module.sections[route.sectionIndex + 1];
        if (nextSection) pick(module.id, nextSection.lessons[0].id);
        else open(module.id);
      }}
      onBack={() => {
        // Back to last lesson of this section
        const sec = module.sections[route.sectionIndex];
        pick(module.id, sec.lessons[sec.lessons.length - 1].id);
      }}
    />
  );
  return (
    <ModulePlayer
      module={module}
      lessonId={route.lessonId}
      progress={progress}
      onLessonRead={lessonId => updateProgress(p => markLessonDone(p, module.id, lessonId))}
      onOverview={() => open(module.id)}
      onPick={pick}
      onBack={goList}
      onStartQuiz={quiz}
    />
  );
}

// ─── Module grid ─────────────────────────────────────────────────────────────

function ModuleGrid({ progress, onOpen }) {
  return (
    <section className="content">
      <Breadcrumb trail={[{ label: 'Learn' }]}/>
      <div className="eyebrow"><span/>CYBERSECURITY AWARENESS</div>
      <h1>Learn to recognize the signs.</h1>
      <p className="lead">Short, practical lessons that help you stay safer online every day. Start with phishing, smishing, or vishing.</p>
      <div className="moduleGrid">
        {learnModules.map(module => {
          const Icon = icons[module.icon];
          const total = totalLessons(module);
          const done = countDone(module, progress);
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <button type="button" className={`moduleCard ${module.tone}`} key={module.id} onClick={() => onOpen(module.id)}>
              <span className={`moduleThumb thumb-${module.id}`}><Icon size={46} strokeWidth={1.5}/></span>
              <span className="moduleBody">
                <span className="moduleTop">
                  <span className={`levelBadge ${module.tone}`}>{module.level}</span>
                  <span className="moduleProvider">{module.provider}</span>
                </span>
                <span className="moduleType">Course | Self-paced</span>
                <span className="moduleTitle">{module.title}</span>
                <span className="moduleDesc">{module.tagline}</span>
                {pct > 0 && (
                  <span className="moduleCardProgress" aria-label={`${pct}% complete`}>
                    <i style={{ width: `${pct}%` }}/>
                  </span>
                )}
                <span className="moduleFooter">
                  <Clock size={14} aria-hidden="true"/> {module.duration} · {total} lessons
                  {pct > 0 && <> · <b>{pct}%</b></>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ─── Module overview ─────────────────────────────────────────────────────────

function ModuleOverview({ module, progress, onBack, onStart }) {
  const Icon = icons[module.icon];
  const total = totalLessons(module);
  const done = countDone(module, progress);
  return (
    <section className="content narrow">
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
              <p>Learn on your own schedule. Each section ends with a short quiz. Score 75% or higher to pass.</p>
              {done > 0 && <p><b>{done} of {total}</b> lessons complete.</p>}
            </div>
            <button className="primary" onClick={() => onStart(module.id)}>
              {done > 0 ? 'Continue' : 'Get Started'} <ChevronRight size={16} aria-hidden="true"/>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Module player ────────────────────────────────────────────────────────────

function ModulePlayer({ module, lessonId, progress, onLessonRead, onOverview, onPick, onBack, onStartQuiz }) {
  const lessons = flatLessons(module);
  const index = Math.max(0, lessons.findIndex(l => l.id === lessonId));
  const lesson = lessons[index];
  const prev = lessons[index - 1] || null;
  const next = lessons[index + 1] || null;
  const done = countDone(module, progress);
  const total = lessons.length;
  const pct = Math.round((done / total) * 100);

  // Figure out which section this lesson belongs to
  let currentSectionIndex = 0;
  let lessonIndexInSection = 0;
  for (let si = 0; si < module.sections.length; si++) {
    const idx = module.sections[si].lessons.findIndex(l => l.id === lesson.id);
    if (idx !== -1) { currentSectionIndex = si; lessonIndexInSection = idx; break; }
  }
  const currentSection = module.sections[currentSectionIndex];
  const isLastLessonInSection = lessonIndexInSection === currentSection.lessons.length - 1;
  const sectionDone = allSectionLessonsDone(module, currentSectionIndex, progress);
  const quizPassed = sectionPassed(module, currentSectionIndex, progress);
  const hasQuiz = Array.isArray(currentSection.quiz) && currentSection.quiz.length > 0;

  const go = id => onPick(module.id, id);

  // Mark lesson read when it mounts
  useEffect(() => { onLessonRead(lesson.id); }, [lesson.id]);

  return (
    <section className="moduleLayout">
      <div className="layoutHead">
        <Breadcrumb trail={[
          { label: 'Learn', onClick: onBack },
          { label: module.title, onClick: onOverview },
          { label: lesson.title },
        ]}/>
      </div>
      <aside className="moduleSidebar" aria-label="Course outline">
        <div className="sideHead">
          <span className={`levelBadge ${module.tone}`}>{module.level}</span>
          <h2>{module.title}</h2>
          <p>{done} of {total} lessons complete</p>
          <div className="sideBar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label={`${pct}% complete`}>
            <i style={{ width: `${pct}%` }}/>
          </div>
        </div>
        {module.sections.map((section, si) => {
          const secPassed = sectionPassed(module, si, progress);
          return (
            <section className="modSection" key={si}>
              <h3>
                {section.title}
                {secPassed && <span className="quizPassedBadge" aria-label="Quiz passed"><Check size={11}/></span>}
              </h3>
              <ul>
                {section.lessons.map(lessonItem => {
                  const active = lessonItem.id === lesson.id;
                  const modProg = progress.find(m => m.moduleId === module.id);
                  const isDone = modProg?.completedLessons.includes(lessonItem.id);
                  return (
                    <li key={lessonItem.id}>
                      <button className={active ? 'active' : ''} onClick={() => go(lessonItem.id)} aria-current={active ? 'step' : undefined}>
                        {isDone
                          ? <span className="lessonDone" aria-label="Completed"><Check size={12}/></span>
                          : active
                            ? <span className="lessonCurrent" role="img" aria-label="In progress"><i/></span>
                            : <span className="lessonTodo" aria-hidden="true"/>}
                        <span className="lessonName">{lessonItem.title}</span>
                      </button>
                    </li>
                  );
                })}
                {section.quiz?.length > 0 && (
                  <li>
                    <button
                      className={secPassed ? 'quizSideItem passed' : 'quizSideItem'}
                      onClick={() => onStartQuiz(module.id, si)}
                      title={secPassed ? 'Quiz passed' : 'Take section quiz'}
                    >
                      {secPassed
                        ? <span className="lessonDone" aria-label="Quiz passed"><Check size={12}/></span>
                        : <span className="lessonTodo" aria-hidden="true"/>}
                      <span className="lessonName">Section Quiz</span>
                    </button>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </aside>
      <article className="lessonStage" aria-live="polite">
        <div className="lessonCard">
          <div className="lessonHead">
            <span className="lessonChip">{lesson.minutes} min</span>
            <h1>{lesson.title}</h1>
            <p>{module.title} · {lesson.section} · Lesson {index + 1} of {total}</p>
          </div>
          {lesson.body.map((para, i) => <p key={i}>{para}</p>)}
          <div className="lessonNav">
            <button className="outline" disabled={!prev} onClick={() => prev && go(prev.id)}>
              <ChevronLeft size={15}/> Previous
            </button>
            <span className="lessonCount">{index + 1} / {total}</span>
            {isLastLessonInSection && hasQuiz && sectionDone && !quizPassed ? (
              <button className="primary" onClick={() => onStartQuiz(module.id, currentSectionIndex)}>
                Take Quiz <ChevronRight size={15}/>
              </button>
            ) : next ? (
              <button className="primary" onClick={() => go(next.id)}>
                Next <ChevronRight size={15}/>
              </button>
            ) : (
              <button className="primary" onClick={onOverview}>
                Finish <Check size={15}/>
              </button>
            )}
          </div>
          {isLastLessonInSection && hasQuiz && quizPassed && (
            <p className="quizPassedNote">
              <Check size={14}/> Section quiz passed · <button className="linkBtn" onClick={() => onStartQuiz(module.id, currentSectionIndex)}>Retake</button>
            </p>
          )}
        </div>
      </article>
    </section>
  );
}

// ─── Section quiz ─────────────────────────────────────────────────────────────

function SectionQuiz({ module, sectionIndex, progress, onDone, onBack }) {
  const section = module.sections[sectionIndex];
  const questions = section.quiz;
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);

  const modProg = progress.find(m => m.moduleId === module.id);
  const secProg = modProg?.sections.find(s => s.sectionIndex === sectionIndex);
  const bestScore = secProg?.bestScore ?? null;
  const passed = secProg?.passed ?? false;

  useScrollTop([module.id, sectionIndex]);

  const select = (qi, oi) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [qi]: oi }));
  };

  const submit = () => {
    if (Object.keys(answers).length < questions.length) return;
    const correct = questions.filter((q, i) => answers[i] === q.answer).length;
    const pct = Math.round((correct / questions.length) * 100);
    setScore(pct);
    setSubmitted(true);
  };

  const retry = () => { setAnswers({}); setSubmitted(false); setScore(null); };

  const allAnswered = Object.keys(answers).length === questions.length;
  const thisPassed = score !== null && score >= PASS_THRESHOLD;

  return (
    <section className="content narrow">
      <Breadcrumb trail={[
        { label: 'Learn', onClick: onBack },
        { label: module.title, onClick: onBack },
        { label: `${section.title} — Quiz` },
      ]}/>
      <div className="quizCard">
        <div className="quizHead">
          <span className={`levelBadge ${module.tone}`}>{module.level}</span>
          <h1>{section.title}</h1>
          <p className="lead">Section Quiz · {questions.length} questions · Pass at {PASS_THRESHOLD}%</p>
          {bestScore !== null && !submitted && (
            <p className="quizBestScore">
              {passed ? <><Check size={14}/> Passed</> : <><X size={14}/> Not yet passed</>}
              {' '}· Best score: <b>{bestScore}%</b>
            </p>
          )}
        </div>

        <ol className="quizList">
          {questions.map((q, qi) => (
            <li key={qi} className={submitted ? (answers[qi] === q.answer ? 'correct' : 'incorrect') : ''}>
              <p className="quizQ"><b>{qi + 1}.</b> {q.q}</p>
              <ul className="quizOptions">
                {q.options.map((opt, oi) => {
                  const chosen = answers[qi] === oi;
                  const isCorrect = oi === q.answer;
                  let cls = chosen ? 'chosen' : '';
                  if (submitted) {
                    if (isCorrect) cls = 'correct';
                    else if (chosen) cls = 'wrong';
                  }
                  return (
                    <li key={oi}>
                      <button
                        type="button"
                        className={`quizOption ${cls}`}
                        onClick={() => select(qi, oi)}
                        disabled={submitted}
                        aria-pressed={chosen}
                      >
                        <span className="quizOptLetter">{String.fromCharCode(65 + oi)}</span>
                        {opt}
                        {submitted && isCorrect && <Check size={14} className="quizOptIcon"/>}
                        {submitted && chosen && !isCorrect && <X size={14} className="quizOptIcon"/>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>

        {!submitted ? (
          <div className="quizActions">
            <button className="outline" onClick={onBack}><ChevronLeft size={15}/> Back</button>
            <button className="primary" disabled={!allAnswered} onClick={submit}>
              Submit Quiz
            </button>
          </div>
        ) : (
          <div className="quizResult">
            <div className={`quizScore ${thisPassed ? 'pass' : 'fail'}`}>
              {thisPassed ? <Check size={22}/> : <X size={22}/>}
              <span>{score}%</span>
              <span>{thisPassed ? 'Passed!' : 'Not passed'}</span>
            </div>
            <p>{thisPassed
              ? 'Great work. You can move on to the next section.'
              : `You need ${PASS_THRESHOLD}% to pass. Review the lessons and try again.`}
            </p>
            <div className="quizActions">
              {!thisPassed && (
                <button className="outline" onClick={retry}><RotateCcw size={14}/> Try Again</button>
              )}
              <button className="primary" onClick={() => onDone(score)}>
                {thisPassed ? 'Continue' : 'Continue Anyway'} <ChevronRight size={15}/>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
