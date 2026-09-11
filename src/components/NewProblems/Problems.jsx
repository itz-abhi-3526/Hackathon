import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { getProblemStatements } from '../../services/problemService.js';
import './Problems.css';

const categoryStyles = {
  FINTECH: { color: '#FF2B16', icon: '◈', accent: 'rgba(255,43,22,0.08)' },
  HEALTH: { color: '#E81605', icon: '◉', accent: 'rgba(232,22,5,0.08)' },
  CLIMATE: { color: '#FF5A33', icon: '◆', accent: 'rgba(255,90,51,0.08)' },
  SECURITY: { color: '#CF1300', icon: '◇', accent: 'rgba(207,19,0,0.08)' },
  EDUCATION: { color: '#FF2B16', icon: '□', accent: 'rgba(255,43,22,0.08)' },
  LOGISTICS: { color: '#B81000', icon: '△', accent: 'rgba(184,16,0,0.08)' },
};

export default function Problems() {
  const [expandedId, setExpandedId] = useState(null);
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.15 });

  useEffect(() => {
    let alive = true;
    getProblemStatements()
      .then((rows) => {
        if (alive) {
          setProblems(rows ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setError('Problem statements could not be loaded.');
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, []);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <section className="problems vh-section" ref={sectionRef} id="problems">
      <div className="problems__inner vh-section-inner">
        {/* Header */}
        <div className="problems__header">
          <motion.div
            className="problems__overline"
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="problems__overline-bar" />
            <span>CHOOSE YOUR TRACK</span>
          </motion.div>

          <motion.h2
            className="problems__heading"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            PROBLEM<br />
            <span className="problems__heading-accent">STATEMENTS</span>
          </motion.h2>
        </div>

        {/* Loading / error / list */}
        {loading ? (
          <div className="problems__loading">LOADING PROBLEMS&hellip;</div>
        ) : error ? (
          <div className="problems__loading problems__loading--err">{error}</div>
        ) : (
          <div className="problems__index">
            {problems.map((problem, idx) => {
              const style = categoryStyles[problem.category] || categoryStyles.FINTECH;
              const isExpanded = expandedId === problem.id;

              return (
                <motion.div
                  key={problem.id}
                  className={`problems__item ${isExpanded ? 'problems__item--expanded' : ''}`}
                  style={{
                    '--item-color': style.color,
                    '--item-accent': style.accent,
                  }}
                  initial={{ opacity: 0, y: 40 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{
                    duration: 0.7,
                    delay: 0.15 + idx * 0.08,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  onClick={() => toggleExpand(problem.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleExpand(problem.id);
                    }
                  }}
                >
                  {/* Item Header */}
                  <div className="problems__item-header">
                    <div className="problems__item-number">{problem.number}</div>
                    <div className="problems__item-main">
                      <div className="problems__item-category">
                        <span className="problems__item-icon">{style.icon}</span>
                        {problem.category}
                      </div>
                      <h3 className="problems__item-title">{problem.title}</h3>
                    </div>
                    <div className="problems__item-meta">
                      <span className="problems__item-difficulty">{problem.difficulty}</span>
                      <span className="problems__item-expand">{isExpanded ? '−' : '+'}</span>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        className="problems__item-detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <div className="problems__item-detail-inner">
                          <div className="problems__item-detail-left">
                            <p className="problems__item-desc">{problem.description}</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Hover accent line */}
                  <div className="problems__item-accent" />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
