// Photos d'exemple libres de droits (licence Pexels : usage gratuit, sans attribution obligatoire).
// Elles servent aux boutiques de démonstration et aux aperçus du générateur ; les commerçants mettent ensuite leurs propres photos.
export const px = (id, w = 600) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

export const PHOTOS = {
  lagon: { hero: 12858513, produits: [33203266, 20858959, 10474333, 9421343] },
  tiare: { hero: 16900686, produits: [7953254, 10853705, 6369286, 725998, 10853720] },
  pae: { hero: 5711890, produits: [6962803, 4611607, 5377650, 5974404] },
  nuit: { hero: 17555295, produits: [922567, 11304837, 16461255, 9421343] },
};

export const heroPhoto = (modele) => px((PHOTOS[modele] || PHOTOS.lagon).hero, 900);
export const productPhoto = (modele, i) => {
  const list = (PHOTOS[modele] || PHOTOS.lagon).produits;
  return list[i] ? px(list[i]) : null;
};

// Seules deux sources d'images sont acceptées dans les sections : le stockage R2 de la plateforme et les photos d'exemple.
export const isSafeImage = (u) => typeof u === 'string' && (
  /^\/img\/[a-f0-9]{32}\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(u)
  || /^https:\/\/images\.pexels\.com\/photos\/\d+\/pexels-photo-\d+\.jpeg\?auto=compress&cs=tinysrgb&w=\d+$/.test(u));
