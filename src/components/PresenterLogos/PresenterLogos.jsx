import './PresenterLogos.css';

const LOGOS = [
  'https://res.cloudinary.com/dudp2imxs/image/upload/v1790240212/WhatsApp_Image_2026-09-24_at_2.19.24_PM_vs4rfo.jpg',
  'https://res.cloudinary.com/dudp2imxs/image/upload/v1790240217/Untitled_design_dktvql.png',
  'https://res.cloudinary.com/dudp2imxs/image/upload/v1790240216/image_ogarax.png',
];

export default function PresenterLogos({ className = '', vertical = false }) {
  return (
    <span
      className={`presenter-logos${vertical ? ' presenter-logos--vertical' : ''}${className ? ` ${className}` : ''}`}
    >
      {LOGOS.map((src) => (
        <img key={src} className="presenter-logos__logo" src={src} alt="" aria-hidden="true" />
      ))}
    </span>
  );
}