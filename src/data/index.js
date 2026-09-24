export const HACKATHON = {
  id: "voidhack-2026",
  name: "HACK2PITCH",
  tagline: "BUILD WITHOUT PERMISSION",
  edition: "2026",
  presenter: "FISAT HORIZON CLUB",
  date: "2026-10-10T09:00:00",
  endDate: "2026-10-11T09:00:00",
  location: "FISAT, ANGAMALY",
  minTeamSize: 2,
  maxTeamSize: 4,
};

export const NAV_LINKS = [
  { label: "ABOUT", href: "#about" },
  { label: "CHALLENGE", href: "#challenge" },
  { label: "PROBLEMS", href: "#problems" },
  { label: "TIMELINE", href: "#timeline" },
  { label: "PRIZES", href: "#prizes" },
  { label: "FAQ", href: "#faq" },
];

export const NAV_GROUPS = [
  {
    id: "event",
    label: "EVENT",
    links: [
      { label: "ABOUT", href: "#about" },
      { label: "PROBLEMS", href: "#problems" },
      { label: "TIMELINE", href: "#timeline" },
      { label: "PRIZES", href: "#prizes" },
    ],
  },
  {
    id: "info",
    label: "INFO",
    links: [
      { label: "FAQ", href: "#faq" },
    ],
  },
];

export const TIMELINE = [
  {
    id: 1,
    label: "REGISTRATION",
    date: "SEP 15",
    description: "Open your team registration",
    phase: "PHASE_01",
    status: "active",
  },
  {
    id: 2,
    label: "TEAM LOCK",
    date: "OCT 03",
    description: "Finalize your team composition",
    phase: "PHASE_02",
    status: "upcoming",
  },
  {
    id: 3,
    label: "HACK BEGINS",
    date: "OCT 10",
    description: "24 hours of building",
    phase: "PHASE_03",
    status: "upcoming",
  },
  {
    id: 4,
    label: "SUBMISSION",
    date: "OCT 11",
    description: "Final submission",
    phase: "PHASE_04",
    status: "upcoming",
  },
  {
    id: 5,
    label: "JUDGING",
    date: "OCT 11",
    description: "Panel evaluation",
    phase: "PHASE_05",
    status: "upcoming",
  },
  {
    id: 6,
    label: "WINNERS",
    date: "OCT 11",
    description: "Awards ceremony",
    phase: "PHASE_06",
    status: "upcoming",
  },
];

export const PRIZES = {
  pool: "50,000",
  grand: { amount: "25,000", label: "FIRST PRIZE", sublabel: "FIRST PRIZE" },
  runner: { amount: "15,000", label: "SECOND PRIZE", sublabel: "SECOND PRIZE" },
  third: { amount: "10,000", label: "THIRD PRIZE", sublabel: "THIRD PRIZE" },
};

export const JUDGES = [
  { id: 1, name: 'Dr. Vikram Rao', role: 'Chief Innovation Officer', company: 'Nexus Tech', domain: 'AI & Systems', initial: 'VR' },
  { id: 2, name: 'Meera Krishnamurthy', role: 'VP Engineering', company: 'CloudStack', domain: 'Infrastructure', initial: 'MK' },
  { id: 3, name: 'Rohan Bhatia', role: 'Head of Product', company: 'DataPulse', domain: 'Data Science', initial: 'RB' },
  { id: 4, name: 'Lakshmi Iyer', role: 'Security Architect', company: 'CyberVault', domain: 'Cybersecurity', initial: 'LI' },
];


export const SPONSORS = {
  title: [
    { name: "NEXUS TECH", tier: "title" },
  ],
  poweredBy: [
    { name: "CLOUDSTACK", tier: "powered" },
    { name: "DATAPULSE", tier: "powered" },
  ],
  tech: [
    { name: "DEVTOOLS", tier: "tech" },
    { name: "CODEBASE", tier: "tech" },
    { name: "SYNTHLAB", tier: "tech" },
    { name: "HACKKIT", tier: "tech" },
  ],
  community: [
    { name: "DEVCOMMUNITY", tier: "community" },
    { name: "OPENHACKERS", tier: "community" },
    { name: "CODECAMPUS", tier: "community" },
    { name: "TECHVAARSA", tier: "community" },
    { name: "HACKBENGALURU", tier: "community" },
  ],
};

export const MENTORS = [
  {
    id: 1,
    name: "Priya Sharma",
    role: "VP of Engineering",
    company: "CloudStack",
    domain: "Distributed Systems",
  },
  {
    id: 2,
    name: "Arjun Mehta",
    role: "CTO",
    company: "DataPulse",
    domain: "Machine Learning",
  },
  {
    id: 3,
    name: "Sarah Chen",
    role: "Principal Architect",
    company: "Nexus Tech",
    domain: "Cloud Infrastructure",
  },
  {
    id: 4,
    name: "Ravi Kumar",
    role: "Head of Security",
    company: "CyberVault",
    domain: "Cybersecurity",
  },
  {
    id: 5,
    name: "Ananya Desai",
    role: "Design Lead",
    company: "SynthLab",
    domain: "Product Design",
  },
  {
    id: 6,
    name: "Marcus Webb",
    role: "Founding Engineer",
    company: "HackKit",
    domain: "Full-Stack Development",
  },
];

export const FAQ_DATA = [
  {
    id: 1,
    question: "WHO CAN PARTICIPATE?",
    answer: "Any college student currently enrolled in a recognized institution across India is eligible to participate. We welcome students from all disciplines — not just computer science. Designers, business students, and engineers from all fields are encouraged to form cross-functional teams.",
  },
  {
    id: 2,
    question: "HOW MANY PEOPLE CAN BE IN A TEAM?",
    answer: "Teams must have between 2 and 4 members. We strongly encourage cross-disciplinary teams. A team with diverse skills — engineering, design, and domain expertise — will always outperform a homogeneous group.",
  },
  {
    id: 3,
    question: "WHAT SHOULD WE BUILD?",
    answer: "Choose from one of our six curated problem statements spanning fintech, healthcare, climate tech, cybersecurity, education, and logistics. Each problem is designed to be solvable within 24 hours while still being ambitious enough to push creative boundaries.",
  },
  {
    id: 4,
    question: "IS THERE A REGISTRATION FEE?",
    answer: "Yes. The registration fee is per team (not per person) and depends on your crew size — a 2-member team pays less than a 4-member team. The exact amount for the current phase is shown on the registration page when you select your team size. The fee covers venue access and meals during the hackathon, plus a swag kit for every participant.",
  },
  {
    id: 5,
    question: "DO WE NEED TO BRING OUR OWN HARDWARE?",
    answer: "Bring your own laptops and essential peripherals. The venue provides power, high-speed internet, and workspace for every team.",
  },
  {
    id: 6,
    question: "WHAT IF WE DON'T HAVE A COMPLETE TEAM?",
    answer: "Attend our pre-hackathon team formation session held before the event. It's designed specifically for solo participants looking for teammates and teams seeking specific skills. Our matching system pairs complementary skill sets.",
  },
  {
    id: 7,
    question: "CAN WE START BUILDING BEFORE THE HACK?",
    answer: "You may prepare research, wireframes, and planning documents. However, all code must be written during the 24-hour hack window. Existing projects, templates, or pre-built components are not permitted. Original work only.",
  },
  {
    id: 8,
    question: "WHAT ARE THE JUDGING CRITERIA?",
    answer: "Projects are evaluated on Innovation (25%), Technical Execution (25%), Impact & Feasibility (20%), Design & User Experience (15%), and Presentation (15%). Each submission is assessed through a live demo and a technical deep-dive.",
  },
  {
    id: 9,
    question: "CAN WE USE AI TOOLS?",
    answer: "Yes — AI-assisted development is actively encouraged. Leverage any tool that makes your team faster: code assistants, design generators, research copilots. The one rule is ownership: your pitch and your build decisions must be yours. Be transparent about which tools you used and how, right in your submission notes for the judges.",
  },
  {
    id: 10,
    question: "WHAT TECH STACK CAN WE USE?",
    answer: "Any stack you're comfortable with — there are no language or framework mandates. We judge what you ship, not the tools you chose.",
  },
  {
    id: 11,
    question: "WHAT DO WE HAVE TO SUBMIT?",
    answer: "Three things: a working demo (live link), your complete code repository, and a 3-minute pitch at the end of the 24 hours. Submissions close sharp at 09:00 IST on 11 October. Make sure your demo link is public and your repo has a clean README explaining how to run it.",
  },
  {
    id: 12,
    question: "WHERE IS THE EVENT?",
    answer: "FISAT Campus, Angamaly, Kerala. The venue provides power, high-speed internet, workspace, and meals for all participants. A full venue map and check-in details are shared with every confirmed team before the event weekend.",
  },
  {
    id: 13,
    question: "WHEN IS HACK2PITCH 2026?",
    answer: "10–11 October 2026. Doors open and builds begin at 09:00 IST on the 10th, running 24 hours straight into the 11th. Mark your calendar — this is the build weekend.",
  },
];
