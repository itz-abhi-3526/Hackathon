import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { SPONSORS } from '../../data';
import './Sponsors.css';

function SponsorLogo({ name, tier }) {
  return (
    <div className={`sponsor-logo sponsor-logo--${tier}`}>
      <div className="sponsor-logo-monogram">{name.charAt(0)}</div>
      <div className="sponsor-logo-name">{name}</div>
    </div>
  );
}

export default function Sponsors() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  const sections = [
    { key: 'title', label: 'TITLE PARTNER', items: SPONSORS.title },
    { key: 'poweredBy', label: 'POWERED BY', items: SPONSORS.poweredBy },
    { key: 'tech', label: 'TECH PARTNERS', items: SPONSORS.tech },
  ];

  const community = SPONSORS.community;

  return (
    <section ref={sectionRef} className="sponsors" id="sponsors">
      <div className="sponsors-inner">
        <motion.div
          className="sponsors-label"
          initial={{ opacity: 0, x: -20 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <span className="sponsors-number">06</span>
          <span className="sponsors-label-divider">/</span>
          <span className="sponsors-label-text">SUPPORT SYSTEM</span>
        </motion.div>

        <motion.h2
          className="sponsors-title"
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          THOSE WHO MAKE
          <span className="sponsors-title-red"> IT POSSIBLE</span>
        </motion.h2>

        <div className="sponsors-sections">
          {sections.map((section, si) => (
            <div key={section.key} className="sponsors-section">
              <motion.div
                className="sponsors-section-label"
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ duration: 0.4, delay: 0.2 + si * 0.1 }}
              >
                <span className="sponsors-section-mark">//</span>
                {section.label}
                <span className="sponsors-section-line" />
              </motion.div>

              <div className="sponsors-section-grid">
                {section.items.map((sponsor, i) => (
                  <motion.div
                    key={sponsor.name}
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.5, delay: 0.3 + si * 0.1 + i * 0.08 }}
                  >
                    <SponsorLogo name={sponsor.name} tier={sponsor.tier} />
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="sponsors-community">
          <motion.div
            className="sponsors-community-label"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.4, delay: 0.6 }}
          >
            <span className="sponsors-section-mark">//</span>
            COMMUNITY PARTNERS
            <span className="sponsors-section-line" />
          </motion.div>

          <div className="sponsors-community-marquee">
            {[...community, ...community].map((sponsor, i) => (
              <div key={`${sponsor.name}-${i}`} className="sponsors-community-item">
                <span className="sponsor-logo-monogram">{sponsor.name.charAt(0)}</span>
                <span className="sponsor-logo-name">{sponsor.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}