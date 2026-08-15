/**
 * Social preview cards.
 *
 * The frames are rendered by /og-preview.html and screenshotted to
 * public/og/*.png by `npm run og`, so the cards use the site's real fonts and
 * real palette instead of an approximation drawn in an image library. The PNGs
 * are committed, because Playwright is not a CI dependency.
 *
 * `slug` is both the card's element id and its output filename.
 */
export interface OgCard {
    slug: string;
    /** Small mono line above the title. */
    kicker: string;
    title: string;
    /** One line under the title. Keep it under about 110 characters. */
    subtitle: string;
    /** Optional mono strip along the bottom, e.g. headline numbers. */
    facts?: string[];
}

export const OG_CARDS: OgCard[] = [
    {
        slug: 'default',
        kicker: 'Electrical Engineering',
        title: 'Cabe Robertson',
        subtitle: 'RF, embedded and sensor-fusion hardware. Seeking a Summer 2027 internship.',
        facts: ['IEEE MYOSA 6.0 finalist', 'U.S. Person, ITAR/EAR eligible', 'Grad Dec 2027'],
    },
    {
        slug: 'projects',
        kicker: 'Projects',
        title: 'Nine builds, with the numbers',
        subtitle: 'Hardware, RF, embedded and signal processing, each with constraints, tradeoffs and results.',
        facts: ['$219 RF demonstrator', '~10 dB noise cut', '$168K production BOM'],
    },
    {
        slug: 'crashguard',
        kicker: 'Flagship · IEEE MYOSA 6.0 finalist',
        title: 'MYOSA CrashGuard',
        subtitle: 'Autonomous crash detection with AI emergency calling, on ESP32 and MPU6050.',
        facts: ['5.0 g dynamic trigger', '100 Hz sampling', '10 s cancel window'],
    },
    {
        slug: 'notes',
        kicker: 'Build Log',
        title: 'One decision per entry',
        subtitle: 'What I got wrong, the evidence that showed it, and what replaced it.',
        facts: ['Sensor calibration', 'Detection thresholds', 'Field test'],
    },
    {
        slug: 'experience',
        kicker: 'Experience',
        title: 'Four engineering roles',
        subtitle: 'Defense RF, unmanned systems production, motor drive, and communications research.',
        facts: ['Syndetix', 'ETV America', 'GILZ', 'Mitchell Coding Group'],
    },
    {
        slug: 'skills',
        kicker: 'Skills',
        title: 'What I can do on day one',
        subtitle: 'RF and electronic warfare, sensor fusion and DSP, embedded firmware, PCB, lab and test.',
        facts: ['ESP32 / C', 'Python / MATLAB', 'VHDL', 'Oscilloscope & SA'],
    },
    {
        slug: 'contact',
        kicker: 'Contact',
        title: 'Available Summer 2027',
        subtitle: 'Las Cruces, NM, and open to relocation. U.S. Person, ITAR/EAR eligible.',
        facts: ['caberobertson@gmail.com', 'linkedin.com/in/caberobertson'],
    },
];

/** Absolute URL of the card a page should advertise. */
export const ogImageFor = (slug: string, site: string | URL) =>
    new URL(`/og/${slug}.png`, site).href;
