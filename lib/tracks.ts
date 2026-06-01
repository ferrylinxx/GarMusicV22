export type Track = {
  id: string;
  title: string;
  file: string;
};

export const tracks: Track[] = [
  { id: "a-ti", title: "A Ti", file: "A Ti.wav" },
  { id: "corazon-traicionero", title: "Corazon Traicionero", file: "Corazón Traicionero.wav" },
  { id: "coracao-partido", title: "Coracao Partido", file: "Coração Partido.wav" },
  { id: "costa-dorada", title: "Costa Dorada", file: "Costa Dorada.wav" },
  { id: "dime-la-verdad", title: "Dime la Verdad", file: "Dime la Verdad.wav" },
  { id: "fiesta-portuguesa", title: "Fiesta Portuguesa", file: "Fiesta Portuguesa.wav" },
  { id: "no-dice-nada", title: "No Dice Nada", file: "No Dice Nada.wav" },
  { id: "no-pares-de-bailar", title: "No Pares de Bailar", file: "No Pares de Bailar.wav" },
  { id: "no-somos-los-de-antes", title: "No Somos los de Antes", file: "No Somos los de Antes.wav" },
  {
    id: "que-nos-esta-pasando-master",
    title: "Que Nos Esta Pasando (Masterizado)",
    file: "Qué Nos Está Pasando_Masterizado_Fuego_dfc7530a-6356-4e9f-b7da-3e55936c7382.wav"
  },
  { id: "que-nos-esta-pasando", title: "Que Nos Esta Pasando", file: "Qué Nos Está Pasando.wav" },
  { id: "rumba-de-verano", title: "Rumba de Verano", file: "Rumba de Verano.wav" },
  { id: "silencio-de-verano", title: "Silencio de Verano", file: "Silencio de Verano.wav" },
  { id: "you-o-only-you", title: "You o Only You", file: "You o Only You.wav" },
  {
    id: "rumbas-portuguesas-no-pares-de-bailar-alt",
    title: "Rumbas Portuguesas - No Pares de Bailar (Alt)",
    file: "ytmp3free.cc_rumbas-portuguesas-no-pares-de-bailar-youtubemp3free.org (1).wav"
  },
  {
    id: "rumbas-portuguesas-no-pares-de-bailar",
    title: "Rumbas Portuguesas - No Pares de Bailar",
    file: "ytmp3free.cc_rumbas-portuguesas-no-pares-de-bailar-youtubemp3free.org.wav"
  }
];

export function assetPath(folder: "tracks" | "artwork", file: string) {
  return `/${folder}/${encodeURIComponent(file)}`;
}
