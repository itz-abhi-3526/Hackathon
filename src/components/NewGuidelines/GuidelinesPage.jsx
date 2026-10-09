import { motion } from 'framer-motion';
import './GuidelinesPage.css';

const EASE = [0.16, 1, 0.3, 1];

/* ── SECTION 01 — REGISTRATION ── */
const REGISTRATION = [
  { text: 'Registration: ', accent: '12:00 PM on October 10, Saturday.' },
  { text: 'Entry after the registration time will not be entertained.' },
  { text: 'Teams should report at the Registration Desk at the designated location inside the FISAT Campus.' },
  { text: 'Slots will be allocated for each team during registration.' },
  { text: 'The hackathon will be conducted in the designated venue at FISAT.' },
];

/* ── SECTION 02 — EVENT SCHEDULE ── */
const SCHEDULE = [
  {
    day: 'SATURDAY, OCTOBER 10',
    rows: [
      ['2:00 PM', 'Hackathon Commences'],
      ['4:30 PM', 'Tea & Refreshments'],
      ['7:30–8:30 PM', 'Dinner'],
    ],
  },
  {
    day: 'SUNDAY, OCTOBER 11',
    rows: [
      ['2:00–5:00 AM', 'First Elimination'],
      ['6:00 AM', 'First Elimination Results Published'],
      ['7:00–8:00 AM', 'Breakfast'],
      ['9:00 AM–12:00 PM', 'Second Elimination'],
      ['12:45–1:30 PM', 'Lunch'],
      ['1:30–3:30 PM', 'Final Presentation'],
    ],
  },
];

/* ── SECTION 03 — GENERAL GUIDELINES ── */
const GENERAL = [
  'Adhere to the schedule and guidelines provided.',
  'Respect the facilities and keep the accommodation areas clean.',
  'Team members can take power naps. Nap rooms with beds are available for that purpose.',
  'At least 1–2 team members should be present during all phases in the allocated slot in the lab.',
  'Last-minute dropouts are not entertained.',
  'All participants must bring laptops for the hackathon.',
  'Further instructions will be given to participants at the time of registration.',
  'Please do not hesitate to post any of your doubts in this group.',
  'Participants are encouraged to bring snacks, blanket, bedsheet, and any necessary medicines.',
  'Drinking and eating are not permitted inside the labs.',
  'First aid will be available on-site.',
  'Kindly approach the volunteers if you require any assistance.',
  'The judgments and eliminations made by mentors and judges are final and at their sole discretion. No questioning of decisions will be entertained.',
  'No disputes will be entertained during the event. In case of any concerns, please inform the volunteers or faculty coordinators.',
  'Participants are not allowed to leave the college until they are officially eliminated.',
  'Freshen-up facilities will be provided.',
  'Meals are arranged for teams actively participating in the event. Teams that have been eliminated are kindly requested to make their own arrangements.',
];

/* ── SECTION 04 — HACKATHON CRITERIA ── */
const CRITERIA = [
  { text: 'All work must be created during the hackathon.' },
  { text: 'Teams have to present their solution in the form of a prototype.' },
  { text: 'Projects must align with the given hackathon problem statements.' },
  { text: 'All projects must be submitted by the designated deadline, including project description, code, and presentation.' },
  { text: 'All code developed during the Hackathon should be the original work of the team. Participants cannot use code or assets created by someone else without proper permissions or licenses.' },
  { text: 'Teams are encouraged to collaborate and seek help from mentors or organizers, but cross-team collaboration is not allowed during the competition.' },
  { accent: 'Judging criteria:', text: ' Innovation, Prototype progress/completion, Future business value, Logical approach, Presentation.' },
];

const SECTIONS = [
  { num: '01', title: 'REGISTRATION' },
  { num: '02', title: 'EVENT SCHEDULE' },
  { num: '03', title: 'GENERAL GUIDELINES' },
  { num: '04', title: 'HACKATHON CRITERIA' },
];

function SectionHead({ num, title }) {
  return (
    <header className="guide__section-head">
      <span className="guide__section-num">{num}</span>
      <h2 className="guide__section-title">{title}</h2>
      <span className="guide__section-rule" aria-hidden="true" />
    </header>
  );
}

export default function GuidelinesPage() {
  return (
    <div className="guide">
      <span className="guide__mark" aria-hidden="true">
        H2P
      </span>

      <header className="guide__bar">
        <div className="guide__bar-inner">
          <a className="guide__brand" href="/">
            HACK<span>.</span>PITCH<span>26</span>
          </a>
          <a className="guide__bar-back" href="/">
            BACK TO HACK2PITCH <span aria-hidden="true">&#8599;</span>
          </a>
        </div>
      </header>

      <main className="guide__main">
        {/* ── MASTHEAD ── */}
        <motion.header
          className="guide__masthead"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <p className="guide__org">FEDERAL INSTITUTE OF SCIENCE AND TECHNOLOGY</p>
          <p className="guide__org-sub">DEPARTMENT OF COMPUTER SCIENCE AND ENGINEERING</p>
          <p className="guide__edition">HACK2PITCH 2026</p>
          <h1 className="guide__title">EVENT GUIDELINES</h1>
          <p className="guide__dates">OCTOBER 10 &amp; 11, 2026</p>
          <a className="guide__masthead-back" href="/">
            BACK TO HACK2PITCH <span aria-hidden="true">&#8599;</span>
          </a>
        </motion.header>

        {/* ── SECTION 01 · REGISTRATION ── */}
        <section className="guide__section" aria-labelledby="guide-sec-1">
          <SectionHead num={SECTIONS[0].num} title={SECTIONS[0].title} />
          <ul className="guide__list" id="guide-sec-1">
            {REGISTRATION.map((item) => (
              <li className="guide__list-item" key={item.text}>
                <span className="guide__list-mark" aria-hidden="true" />
                <p className="guide__list-text">
                  {item.text}
                  {item.accent && <strong className="guide__list-accent">{item.accent}</strong>}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── SECTION 02 · EVENT SCHEDULE ── */}
        <section className="guide__section" aria-labelledby="guide-sec-2">
          <SectionHead num={SECTIONS[1].num} title={SECTIONS[1].title} />
          <div className="guide__schedule" id="guide-sec-2">
            {SCHEDULE.map((block) => (
              <div className="guide__schedule-day" key={block.day}>
                <h3 className="guide__schedule-day-title">{block.day}</h3>
                <table className="guide__schedule-table">
                  <thead>
                    <tr>
                      <th scope="col" className="guide__schedule-time-head">TIME</th>
                      <th scope="col" className="guide__schedule-activity-head">ACTIVITY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map(([time, activity]) => (
                      <tr key={`${block.day}-${time}-${activity}`}>
                        <td className="guide__schedule-time">{time}</td>
                        <td className="guide__schedule-activity">{activity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 03 · GENERAL GUIDELINES ── */}
        <section className="guide__section" aria-labelledby="guide-sec-3">
          <SectionHead num={SECTIONS[2].num} title={SECTIONS[2].title} />
          <ol className="guide__points" id="guide-sec-3">
            {GENERAL.map((point, i) => (
              <li className="guide__point" key={point}>
                <span className="guide__point-index" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="guide__point-text">{point}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── SECTION 04 · HACKATHON CRITERIA ── */}
        <section className="guide__section" aria-labelledby="guide-sec-4">
          <SectionHead num={SECTIONS[3].num} title={SECTIONS[3].title} />
          <ol className="guide__points" id="guide-sec-4">
            {CRITERIA.map((point, i) => (
              <li className="guide__point" key={point.text}>
                <span className="guide__point-index" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="guide__point-text">
                  {point.accent && <strong className="guide__list-accent">{point.accent}</strong>}
                  {point.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── END ── */}
        <footer className="guide__end">
          <p className="guide__end-name">HACK2PITCH 2026</p>
          <p className="guide__end-tagline">PITCH. BUILD. LAUNCH.</p>
          <a className="guide__end-back" href="/">
            BACK TO HOMEPAGE <span aria-hidden="true">&#8599;</span>
          </a>
        </footer>
      </main>
    </div>
  );
}
