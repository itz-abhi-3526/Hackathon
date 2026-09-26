import './PresenterLogos.css';

const LOGOS = [
  'https://res.cloudinary.com/dudp2imxs/image/upload/v1790240212/WhatsApp_Image_2026-09-24_at_2.19.24_PM_vs4rfo.jpg',
  'https://res.cloudinary.com/dudp2imxs/image/upload/v1790240217/Untitled_design_dktvql.png',
  'https://res.cloudinary.com/dudp2imxs/image/upload/v1790240216/image_ogarax.png',
];

/* `logos` lets a single surface present a different set of organizer
   marks. The default is the established set, so every other surface
   (boot, ticket, footer, final CTA) is left exactly as it is. */
export default function PresenterLogos({ className = '', vertical = false, logos = LOGOS }) {
  return (
    <span
      className={`presenter-logos${vertical ? ' presenter-logos--vertical' : ''}${className ? ` ${className}` : ''}`}
    >
      {logos.map((src) => (
        <img key={src} className="presenter-logos__logo" src={src} alt="" aria-hidden="true" />
      ))}
    </span>
  );
}