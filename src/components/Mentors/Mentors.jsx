import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowUpRight, Briefcase, Code2 } from 'lucide-react';
import { MENTORS } from '../../data';
import './Mentors.css';

export default function Mentors() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });
  const [hoveredMentor, setHoveredMentor] = useState(null);

  return (
    <section ref={sectionRef} className="mentors" id="mentors">
      <div className="mentors-inner">
        <motion.div
          className="mentors-label"
          initial={{ opacity: 0, x: -20 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <span className="mentors-number">07</span>
          <span className="mentors-label-divider">/</span>
          <span className="mentors-label-text">THE MENTORS &amp; JUDGES</span>
        </motion.div>

        <motion.h2
          className="mentors-title"
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          LEARN FROM
          <span className="mentors-title-red"> THE BEST</span>
        </motion.h2>

        <div className="mentors-grid">
          {MENTORS.map((mentor, i) => {
            const isHovered = hoveredMentor === mentor.id;
            return (
              <motion.div
                key={mentor.id}
                className={`mentor-card ${isHovered ? 'mentor-card--hovered' : ''}`}
                onMouseEnter={() => setHoveredMentor(mentor.id)}
                onMouseLeave={() => setHoveredMentor(null)}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.15 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="mentor-card-index">
                  {String(mentor.id).padStart(2, '0')}
                </div>

                <div className="mentor-card-monogram">
                  {mentor.name.split(' ').map(w => w[0]).join('')}
                </div>

                <div className="mentor-card-info">
                  <h3 className="mentor-card-name">{mentor.name}</h3>
                  <span className="mentor-card-role">{mentor.role}</span>
                  <span className="mentor-card-company">{mentor.company}</span>
                </div>

                <div className="mentor-card-expertise">
                  <span className="mentor-card-expertise-title">DOMAIN</span>
                  <span className="mentor-card-expertise-value">{mentor.domain}</span>
                </div>

                <div className="mentor-card-icon">
                  {mentor.domain.toLowerCase().includes('design') ? (
                    <Briefcase size={14} />
                  ) : mentor.domain.toLowerCase().includes('security') ? (
                    <Code2 size={14} />
                  ) : (
                    <ArrowUpRight size={14} />
                  )}
                </div>

                <div className="mentor-card-overlay" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}