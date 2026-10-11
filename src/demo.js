// Boutiques de démonstration (fictives) affichées dans le carrousel d'accueil — une par modèle.
// Aucune base de données : tout est ici, illustrations SVG originales à la place des photos.
import { MODELES } from './plans.js';
import { heroPhoto, productPhoto } from './photos.js';

const S = (type, o) => ({ id: type + Math.random().toString(36).slice(2, 6), type, visible: true, ...o });
const offre = (id, nom, prix_xpf, illu, description = '', stock = 5) => ({ id, nom, prix_xpf, illu, description, stock, image_url: null });

export const DEMOS = {
  lagon: {
    nom: 'Hoa Nui Bijoux', slogan: 'Bijoux de nacre et de coquillages, façonnés à Moorea.', ile: 'Moorea',
    offres: [
      offre('d1', 'Bracelet coquillage', 3500, 'vague', 'Cordon ajustable, coquillages polis.'),
      offre('d2', 'Pendentif nacre gravée', 6900, 'perle'),
      offre('d3', 'Boucles d’oreilles tiare', 4200, 'fleur'),
      offre('d4', 'Collier keshi', 12500, 'perle'),
      offre('d5', 'Chaîne de cheville', 2800, 'soleil'),
      offre('d6', 'Bague feuille d’uru', 5400, 'feuille', '', 0),
    ],
    sections: [
      S('annonce', { texte: 'Envoi offert à Moorea et Tahiti dès 8 000 XPF' }),
      S('hero', { titre: 'Le lagon à porter chaque jour', texte: 'Des bijoux légers en nacre et coquillages, imaginés et polis à la main.', bouton: 'Découvrir', motif: 'vague' }),
      S('produits', { titre: 'Nouveautés' }),
      S('avantages', { titre: 'Notre atelier', items: [
        { titre: 'Fait main', texte: 'Chaque pièce est unique.' },
        { titre: 'Matières locales', texte: 'Nacre et coquillages du fenua.' },
        { titre: 'Emballage cadeau', texte: 'Offert pour chaque commande.' }] }),
      S('faq', { titre: 'Questions fréquentes', items: [
        { q: 'Les bijoux résistent-ils à l’eau ?', r: 'Oui, mais rincez-les à l’eau douce après la baignade.' },
        { q: 'Livrez-vous dans les îles ?', r: 'Oui, par la poste, dans toute la Polynésie.' }] }),
      S('contact', { titre: 'Une question ?', texte: 'Écrivez-nous, nous répondons dans la journée.' }),
    ],
  },
  pae: {
    nom: 'Atelier Ruahine', slogan: 'Bois sculpté, tapa et objets du quotidien, faits à Raiatea.', ile: 'Raiatea',
    offres: [
      offre('p1', 'Saladier en bois de tou', 9800, 'tapa', 'Pièce tournée main, finition huile.'),
      offre('p2', 'Planche à découper', 6500, 'feuille'),
      offre('p3', 'Tapa décoratif 40 cm', 14000, 'tapa'),
      offre('p4', 'Bol en noix de coco', 2500, 'soleil'),
      offre('p5', 'Peigne sculpté', 3900, 'vague'),
      offre('p6', 'Tiki de jardin', 18500, 'feuille', '', 2),
    ],
    sections: [
      S('annonce', { texte: 'Pièces uniques · Expédition soignée dans les îles' }),
      S('hero', { titre: 'La matière avant tout', texte: 'Des objets en bois et en tapa, travaillés lentement, pour durer.', bouton: 'Voir l’atelier', motif: 'tapa' }),
      S('produits', { titre: 'Pièces disponibles' }),
      S('texte', { titre: 'Notre histoire', texte: 'Trois générations de sculpteurs, un même respect du bois.\nChaque objet porte la marque de la main qui l’a façonné.' }),
      S('contact', { titre: 'Visiter l’atelier', texte: 'Sur rendez-vous, du lundi au samedi.' }),
    ],
  },
  tiare: {
    nom: 'Hina Soins', slogan: 'Monoï, savons et soins au tiare, préparés à Tahiti.', ile: 'Tahiti',
    offres: [
      offre('t1', 'Monoï tiare 100 ml', 1800, 'fleur', 'Fleurs de tiare macérées dans l’huile de coco.'),
      offre('t2', 'Savon coco-vanille', 900, 'soleil'),
      offre('t3', 'Gommage sable noir', 2400, 'vague'),
      offre('t4', 'Huile de tamanu', 2900, 'feuille'),
      offre('t5', 'Bougie fleur de tiare', 3200, 'fleur'),
      offre('t6', 'Coffret découverte', 6800, 'perle'),
    ],
    sections: [
      S('annonce', { texte: 'Coffrets cadeaux disponibles toute l’année' }),
      S('hero', { titre: 'Prendre soin de soi, au parfum du tiare', texte: 'Des soins simples, aux ingrédients du fenua.', bouton: 'Découvrir les soins', motif: 'fleur' }),
      S('produits', { titre: 'Nos soins' }),
      S('avantages', { titre: 'Nos engagements', items: [
        { titre: 'Ingrédients locaux', texte: 'Coco, tiare, tamanu, vanille.' },
        { titre: 'Petites séries', texte: 'Préparés chaque semaine.' },
        { titre: 'Sans plastique', texte: 'Flacons en verre réutilisables.' },
        { titre: 'Conseils', texte: 'Nous répondons à vos questions.' }] }),
      S('faq', { titre: 'Questions fréquentes', items: [
        { q: 'Le monoï fige-t-il ?', r: 'Oui, sous 24 °C. Passez le flacon sous l’eau chaude.' }] }),
      S('contact', { titre: 'Nous écrire', texte: 'Conseils personnalisés sur WhatsApp.' }),
    ],
  },
  nuit: {
    nom: 'Poe Nui Perles', slogan: 'Perles de culture de Tahiti, sélectionnées une à une.', ile: 'Rangiroa',
    offres: [
      offre('n1', 'Perle cerclée 10 mm', 8500, 'perle', 'Reflets aubergine, certificat fourni.'),
      offre('n2', 'Collier 7 perles', 45000, 'perle'),
      offre('n3', 'Boucles perles 9 mm', 22000, 'perle'),
      offre('n4', 'Bracelet cuir et perle', 7900, 'vague'),
      offre('n5', 'Bague or et perle', 58000, 'soleil', '', 1),
      offre('n6', 'Écrin cadeau', 3500, 'tapa'),
    ],
    sections: [
      S('annonce', { texte: 'Chaque perle est livrée avec son certificat' }),
      S('hero', { titre: 'La perle noire, dans toute sa lumière', texte: 'Des perles choisies à la ferme, montées avec sobriété.', bouton: 'Voir les perles', motif: 'perle' }),
      S('produits', { titre: 'La sélection' }),
      S('texte', { titre: 'De la ferme à l’écrin', texte: 'Nous travaillons directement avec deux fermes perlières des Tuamotu.' }),
      S('faq', { titre: 'Questions fréquentes', items: [
        { q: 'Comment entretenir une perle ?', r: 'Essuyez-la avec un chiffon doux, évitez parfums et crèmes.' }] }),
      S('contact', { titre: 'Rendez-vous privé', texte: 'Présentation des perles sur rendez-vous.' }),
    ],
  },
};

export function demoBoutique(modele) {
  const d = DEMOS[modele];
  if (!d) return null;
  const m = MODELES[modele];
  return {
    boutique: {
      id: 'demo-' + modele, nom: d.nom, slogan: d.slogan, ile: d.ile, modele, statut: 'active',
      couleur_principale: m.primary, couleur_secondaire: m.secondary, logo_url: null,
      whatsapp: '', telephone: '', infos_livraison: 'Expédition sous 48 h par la poste.',
    },
    offres: d.offres.map((o, i) => ({ ...o, image_url: productPhoto(modele, i) })),
    sections: d.sections.map((x) => (x.type === 'hero' ? { ...x, image: heroPhoto(modele) } : x)),
  };
}
