import Image from 'next/image';

// Logo de Idealo Films: negro en modo claro y blanco en modo oscuro.
const LOGO_CLARO = 'https://res.cloudinary.com/dnprz5iie/image/upload/v1773951904/Recurso_10_i38u5g.png';
const LOGO_OSCURO = 'https://res.cloudinary.com/dnprz5iie/image/upload/v1773951903/Recurso_9_w1qho1.png';

export default function Logo({ posicion = 'left center', priority, unoptimized, blanco }: {
  posicion?: string; priority?: boolean; unoptimized?: boolean;
  /** Siempre el logo blanco (para fondos oscuros fijos, como el login) */
  blanco?: boolean;
}) {
  const estilo = { objectFit: 'contain' as const, objectPosition: posicion };
  if (blanco) return <Image src={LOGO_OSCURO} alt="Idealo Films" fill style={estilo} priority={priority} unoptimized={unoptimized} />;
  return (
    <>
      <Image src={LOGO_CLARO} alt="Idealo Films" fill style={estilo} priority={priority} unoptimized={unoptimized} className="dark:hidden" />
      <Image src={LOGO_OSCURO} alt="Idealo Films" fill style={estilo} priority={priority} unoptimized={unoptimized} className="hidden dark:block" />
    </>
  );
}
