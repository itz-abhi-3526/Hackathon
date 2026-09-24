export const HACKATHON = {
  id: "voidhack-2026",
  name: "HACK2PITCH",
  tagline: "PITCH. BUILD. LAUNCH.",
  edition: "2026",
  presenter: "FISAT HORIZON CLUB",
  date: "2026-10-10T09:00:00",
  endDate: "2026-10-11T09:00:00",
  location: "FISAT, ANGAMALY",
  minTeamSize: 3,
  maxTeamSize: 4,
};

export const NAV_LINKS = [
  { label: "ABOUT", href: "#about" },
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
    answer: "HACK2PITCH is open to students who meet the event's eligibility requirements.",
  },
  {
    id: 2,
    question: "HOW MANY PEOPLE CAN BE IN A TEAM?",
    answer: "Each team must have 3–4 members.",
  },
  {
    id: 3,
    question: "WHAT SHOULD WE BUILD?",
    answer: "The official challenge statements are revealed during the hackathon. Teams pick a challenge, build a working prototype, and pitch their solution to the judges.",
  },
  {
    id: 4,
    question: "WHAT SHOULD WE BRING?",
    answer: "Bring your laptop, charger, required peripherals, identification and anything else needed to build your project. Basic event infrastructure will be provided at the venue.",
  },
  {
    id: 5,
    question: "WHAT IF WE DON'T HAVE A COMPLETE TEAM?",
    answer: "Participants can connect with others and form a team before the hackathon. Team formation support may also be provided by the organizers.",
  },
  {
    id: 6,
    question: "CAN WE START BUILDING BEFORE THE HACK?",
    answer: "Research, planning and technology exploration may be done beforehand. The core solution submitted for evaluation should be developed during the official hackathon period.",
  },
  {
    id: 7,
    question: "WHAT ARE THE JUDGING CRITERIA?",
    answer: "Projects will be evaluated based on problem relevance, innovation, technical execution, user experience, impact and the quality of the final pitch/demo.",
  },
  {
    id: 8,
    question: "CAN WE USE AI TOOLS?",
    answer: "AI tools and developer assistants may be used unless a specific problem statement or official rule restricts them. Teams should understand and be able to explain their implementation.",
  },
  {
    id: 9,
    question: "WHAT TECHNOLOGIES CAN WE USE?",
    answer: "There is no mandatory technology stack unless a specific problem statement says otherwise.",
  },
  {
    id: 10,
    question: "WHAT DO WE HAVE TO SUBMIT?",
    answer: "Teams should submit their working prototype, source code or repository, project description and final presentation/demo according to the official submission guidelines.",
  },
  {
    id: 11,
    question: "WHERE IS HACK2PITCH 2026 BEING HELD?",
    answer: "HACK2PITCH 2026 will be held at the Federal Institute of Science and Technology (FISAT), Angamaly, Kerala.",
  },
  {
    id: 12,
    question: "HOW LONG IS THE HACKATHON?",
    answer: "HACK2PITCH is a 24-hour build sprint taking place on 10–11 October 2026.",
  },
];
