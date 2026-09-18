export const HACKATHON = {
  id: "voidhack-2026",
  name: "VOIDHACK",
  tagline: "BUILD WITHOUT PERMISSION",
  edition: "2026",
  presenter: "NEXUS INSTITUTE OF TECHNOLOGY",
  date: "2026-10-17T09:00:00",
  endDate: "2026-10-19T09:00:00",
  location: "NEXUS CAMPUS, BENGALURU",
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
    id: "people",
    label: "PEOPLE",
    links: [
      { label: "JUDGES", href: "#judges" },
      { label: "MENTORS", href: "#mentors" },
      { label: "SPONSORS", href: "#sponsors" },
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
    date: "OCT 10",
    description: "Finalize your team composition",
    phase: "PHASE_02",
    status: "upcoming",
  },
  {
    id: 3,
    label: "HACK BEGINS",
    date: "OCT 17",
    description: "48 hours of intense building",
    phase: "PHASE_03",
    status: "upcoming",
  },
  {
    id: 4,
    label: "MENTOR CHECK",
    date: "OCT 18",
    description: "Mid-hack mentor review",
    phase: "PHASE_04",
    status: "upcoming",
  },
  {
    id: 5,
    label: "SUBMISSION",
    date: "OCT 19",
    description: "Final submission deadline",
    phase: "PHASE_05",
    status: "upcoming",
  },
  {
    id: 6,
    label: "JUDGING",
    date: "OCT 19",
    description: "Panel evaluation round",
    phase: "PHASE_06",
    status: "upcoming",
  },
  {
    id: 7,
    label: "WINNERS",
    date: "OCT 19",
    description: "Awards ceremony",
    phase: "PHASE_07",
    status: "upcoming",
  },
];

export const PRIZES = {
  grand: { amount: "1,00,000", label: "GRAND PRIZE", sublabel: "CHAMPION" },
  runner: { amount: "50,000", label: "RUNNER UP", sublabel: "SECOND PLACE" },
  third: { amount: "25,000", label: "THIRD PLACE", sublabel: "THIRD PLACE" },
  special: [
    { amount: "15,000", label: "BEST UI/UX" },
    { amount: "15,000", label: "MOST INNOVATIVE" },
    { amount: "15,000", label: "BEST USE OF AI" },
  ],
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
    answer: "Choose from one of our six curated problem statements spanning fintech, healthcare, climate tech, cybersecurity, education, and logistics. Each problem is designed to be solvable within 48 hours while still being ambitious enough to push creative boundaries.",
  },
  {
    id: 4,
    question: "IS THERE A REGISTRATION FEE?",
    answer: "Yes. The registration fee is per team (not per person) and depends on your crew size — a 2-member team pays less than a 4-member team. The exact amount for the current phase is shown on the registration page when you select your team size. The fee covers venue access, meals during the hackathon, swag kits, mentorship sessions, and infrastructure credits from our technology partners.",
  },
  {
    id: 5,
    question: "DO WE NEED TO BRING OUR OWN HARDWARE?",
    answer: "Bring your own laptops and essential peripherals. The venue will provide power, high-speed internet, and workspace. Cloud infrastructure credits will be provided by our technology partners for any cloud-based solutions.",
  },
  {
    id: 6,
    question: "WHAT IF WE DON'T HAVE A COMPLETE TEAM?",
    answer: "Attend our pre-hackathon team formation session on October 12. It's designed specifically for solo participants looking for teammates and teams seeking specific skills. Our matching system pairs complementary skill sets.",
  },
  {
    id: 7,
    question: "CAN WE START BUILDING BEFORE THE HACK?",
    answer: "You may prepare research, wireframes, and planning documents. However, all code must be written during the 48-hour hack window. Existing projects, templates, or pre-built components are not permitted. Original work only.",
  },
  {
    id: 8,
    question: "WHAT'S THE JUDGING CRITERIA?",
    answer: "Projects are evaluated on Innovation (25%), Technical Execution (25%), Impact & Feasibility (20%), Design & User Experience (15%), and Presentation (15%). Our panel of industry experts will assess each submission through both a demo and a technical deep-dive.",
  },
];
