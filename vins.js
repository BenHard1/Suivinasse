// Référentiel des vins : pour chaque appellation (et couleur), la fenêtre de dégustation habituelle,
// les cépages, le profil aromatique et le style (pour les accords). Sert, sans appel à l'IA, à
// proposer des valeurs cohérentes à l'ajout d'une bouteille, à calculer la maturité quand aucune date
// n'est saisie, et à classer les vins pour les accords mets-vins.
//
// Fenêtre : [à boire à partir de, jusqu'à] en années après le millésime, pour un vin de bonne
// facture d'un producteur sérieux. Les mentions Grand cru / Premier cru / Cru classé / Vieilles
// vignes allongent la garde (voir MODIFIERS). Pour un vin sans millésime (champagne brut sans année,
// porto ruby…), la fenêtre part de l'année d'entrée en cave.
//
// Couleurs : R rouge, B blanc sec, RS rosé, E effervescent, L liquoreux / moelleux, M muté (porto,
// vin doux naturel, xérès…).
// Styles : RL rouge léger, RM rouge, RC rouge corsé, BV blanc vif, BA blanc ample, BR blanc aromatique,
// LQ liquoreux, RO rosé, BU effervescent, PO porto / muté.
//
// Ligne : [appellation, région, couleur, de, jusqu'à, cépages, arômes, style, options]
// options : a = autres façons de l'écrire (« mot1+mot2 » : les deux mots doivent figurer),
//           nv = souvent sans millésime, mil = fenêtre quand un millésime est indiqué.

const RAW = [
  // ---------------- Bordeaux ----------------
  ["Bordeaux", "Bordeaux", "R", 2, 7, "Merlot, Cabernet sauvignon, Cabernet franc", "fruits rouges, cassis, tanins souples", "RM"],
  ["Bordeaux Supérieur", "Bordeaux", "R", 3, 10, "Merlot, Cabernet sauvignon, Cabernet franc", "cassis, prune, boisé léger", "RM"],
  ["Bordeaux", "Bordeaux", "B", 1, 4, "Sauvignon, Sémillon, Muscadelle", "agrumes, buis, fruits blancs", "BV"],
  ["Bordeaux", "Bordeaux", "RS", 0, 2, "Merlot, Cabernet franc", "fraise, groseille", "RO", { a: ["bordeaux clairet", "clairet"] }],
  ["Entre-Deux-Mers", "Bordeaux", "B", 1, 3, "Sauvignon, Sémillon", "agrumes, fleurs blanches, vif", "BV"],
  ["Médoc", "Bordeaux", "R", 4, 12, "Cabernet sauvignon, Merlot", "cassis, cèdre, tanins fermes", "RC"],
  ["Haut-Médoc", "Bordeaux", "R", 5, 15, "Cabernet sauvignon, Merlot", "cassis, mine de crayon, boisé", "RC"],
  ["Margaux", "Bordeaux", "R", 7, 25, "Cabernet sauvignon, Merlot", "violette, cassis, élégance, tanins soyeux", "RC"],
  ["Pauillac", "Bordeaux", "R", 8, 30, "Cabernet sauvignon, Merlot", "cassis, cèdre, graphite, tabac", "RC"],
  ["Saint-Julien", "Bordeaux", "R", 7, 25, "Cabernet sauvignon, Merlot", "cassis, cèdre, équilibre", "RC"],
  ["Saint-Estèphe", "Bordeaux", "R", 8, 25, "Cabernet sauvignon, Merlot", "fruits noirs, terre, tanins puissants", "RC"],
  ["Listrac-Médoc", "Bordeaux", "R", 5, 15, "Merlot, Cabernet sauvignon", "fruits noirs, tanins fermes", "RC", { a: ["listrac"] }],
  ["Moulis", "Bordeaux", "R", 5, 15, "Merlot, Cabernet sauvignon", "fruits noirs, souplesse", "RM", { a: ["moulis-en-medoc"] }],
  ["Pessac-Léognan", "Bordeaux", "R", 6, 20, "Cabernet sauvignon, Merlot", "fumé, cassis, tabac, terre chaude", "RC", { a: ["pessac"] }],
  ["Pessac-Léognan", "Bordeaux", "B", 3, 15, "Sauvignon, Sémillon", "agrumes, cire, fumé, fruits blancs", "BA", { a: ["pessac"] }],
  ["Graves", "Bordeaux", "R", 4, 12, "Cabernet sauvignon, Merlot", "fruits rouges, fumé, tabac", "RM"],
  ["Graves", "Bordeaux", "B", 2, 8, "Sémillon, Sauvignon", "agrumes, cire d'abeille, fruits blancs", "BA"],
  ["Saint-Émilion", "Bordeaux", "R", 4, 12, "Merlot, Cabernet franc", "prune, fruits rouges mûrs, tanins souples", "RM"],
  ["Saint-Émilion Grand Cru", "Bordeaux", "R", 6, 20, "Merlot, Cabernet franc", "prune, truffe, épices douces, velouté", "RM"],
  ["Saint-Émilion Grand Cru Classé", "Bordeaux", "R", 7, 25, "Merlot, Cabernet franc", "fruits noirs, truffe, cèdre, profondeur", "RC", { a: ["saint-emilion+premier grand cru"] }],
  ["Montagne-Saint-Émilion", "Bordeaux", "R", 3, 10, "Merlot, Cabernet franc", "fruits rouges, souplesse", "RM", { a: ["lussac-saint-emilion", "puisseguin-saint-emilion", "saint-georges-saint-emilion"] }],
  ["Pomerol", "Bordeaux", "R", 6, 25, "Merlot, Cabernet franc", "truffe, prune, violette, velours", "RM"],
  ["Lalande-de-Pomerol", "Bordeaux", "R", 4, 12, "Merlot, Cabernet franc", "prune, fruits rouges, rondeur", "RM"],
  ["Fronsac", "Bordeaux", "R", 5, 15, "Merlot, Cabernet franc", "fruits noirs, épices, tanins fermes", "RM", { a: ["canon-fronsac"] }],
  ["Castillon Côtes de Bordeaux", "Bordeaux", "R", 4, 12, "Merlot, Cabernet franc", "fruits noirs, épices", "RM", { a: ["castillon"] }],
  ["Blaye Côtes de Bordeaux", "Bordeaux", "R", 3, 10, "Merlot, Cabernet sauvignon", "fruits rouges, souplesse", "RM", { a: ["blaye", "cotes de bourg", "francs cotes de bordeaux", "cadillac cotes de bordeaux", "cotes de bordeaux"] }],
  ["Sauternes", "Bordeaux", "L", 8, 40, "Sémillon, Sauvignon, Muscadelle", "abricot, miel, safran, écorce d'orange confite", "LQ"],
  ["Barsac", "Bordeaux", "L", 8, 35, "Sémillon, Sauvignon", "abricot, agrumes confits, miel, fraîcheur", "LQ"],
  ["Loupiac", "Bordeaux", "L", 4, 15, "Sémillon, Sauvignon", "miel, fruits confits", "LQ", { a: ["sainte-croix-du-mont", "cadillac+moelleux", "cerons"] }],
  ["Crémant de Bordeaux", "Bordeaux", "E", 1, 3, "Sémillon, Cabernet franc, Merlot", "pomme, agrumes, bulles fines", "BU", { nv: true }],

  // ---------------- Bourgogne ----------------
  ["Bourgogne", "Bourgogne", "R", 2, 6, "Pinot noir", "cerise, framboise, fraîcheur", "RL", { a: ["bourgogne pinot noir", "bourgogne cote d'or"] }],
  ["Bourgogne", "Bourgogne", "B", 1, 4, "Chardonnay", "pomme, fleurs blanches, beurre léger", "BA", { a: ["bourgogne chardonnay"] }],
  ["Bourgogne Aligoté", "Bourgogne", "B", 1, 3, "Aligoté", "citron, pomme verte, vif", "BV", { a: ["aligote", "bouzeron"] }],
  ["Bourgogne Passetoutgrains", "Bourgogne", "R", 1, 3, "Gamay, Pinot noir", "fruits rouges croquants", "RL", { a: ["passetoutgrains", "coteaux bourguignons"] }],
  ["Bourgogne Hautes-Côtes de Nuits", "Bourgogne", "R", 2, 7, "Pinot noir", "cerise, groseille, fraîcheur", "RL", { a: ["hautes-cotes de nuits", "hautes-cotes de beaune"] }],
  ["Bourgogne Hautes-Côtes de Beaune", "Bourgogne", "B", 1, 5, "Chardonnay", "fruits blancs, fraîcheur", "BV", { a: ["hautes-cotes+blanc"] }],
  ["Petit Chablis", "Bourgogne", "B", 1, 3, "Chardonnay", "citron, pomme verte, vif", "BV"],
  ["Chablis", "Bourgogne", "B", 2, 6, "Chardonnay", "silex, citron, iode, fleurs blanches", "BV"],
  ["Chablis Premier Cru", "Bourgogne", "B", 3, 10, "Chardonnay", "silex, coquille d'huître, citron, noisette", "BV", { a: ["chablis 1er cru", "chablis+premier cru", "chablis+1er cru"] }],
  ["Chablis Grand Cru", "Bourgogne", "B", 5, 18, "Chardonnay", "minéral, noisette, beurre, profondeur saline", "BA", { a: ["chablis+grand cru", "les clos", "vaudesir", "valmur", "blanchot", "bougros", "grenouilles", "les preuses"] }],
  ["Irancy", "Bourgogne", "R", 3, 10, "Pinot noir, César", "cerise noire, épices, tanins frais", "RL"],
  ["Saint-Bris", "Bourgogne", "B", 1, 3, "Sauvignon", "bourgeon de cassis, agrumes", "BV"],
  ["Marsannay", "Bourgogne", "R", 3, 8, "Pinot noir", "framboise, cerise, fraîcheur", "RL"],
  ["Fixin", "Bourgogne", "R", 4, 12, "Pinot noir", "fruits noirs, structure", "RL"],
  ["Côte de Nuits-Villages", "Bourgogne", "R", 3, 10, "Pinot noir", "cerise, sous-bois léger", "RL"],
  ["Gevrey-Chambertin", "Bourgogne", "R", 5, 18, "Pinot noir", "cerise noire, réglisse, sous-bois, puissance", "RL"],
  ["Morey-Saint-Denis", "Bourgogne", "R", 5, 18, "Pinot noir", "fruits noirs, épices, terre", "RL"],
  ["Chambolle-Musigny", "Bourgogne", "R", 5, 18, "Pinot noir", "violette, framboise, dentelle, finesse", "RL"],
  ["Vougeot", "Bourgogne", "R", 5, 15, "Pinot noir", "cerise, réglisse", "RL"],
  ["Clos de Vougeot", "Bourgogne", "R", 7, 25, "Pinot noir", "fruits noirs, épices, sous-bois, ampleur", "RL", { a: ["clos vougeot"] }],
  ["Vosne-Romanée", "Bourgogne", "R", 5, 20, "Pinot noir", "épices, rose, cerise, velours", "RL"],
  ["Nuits-Saint-Georges", "Bourgogne", "R", 5, 18, "Pinot noir", "cerise noire, cacao, terre, charpente", "RL"],
  ["Grand cru de la Côte de Nuits", "Bourgogne", "R", 8, 30, "Pinot noir", "fruits noirs, épices, sous-bois, grande profondeur", "RL", { a: ["chambertin", "clos de beze", "musigny", "bonnes-mares", "clos de la roche", "clos saint-denis", "clos de tart", "clos des lambrays", "richebourg", "romanee-conti", "la tache", "romanee-saint-vivant", "la romanee", "la grande rue", "echezeaux", "grands-echezeaux", "charmes-chambertin", "mazis-chambertin", "latricieres-chambertin", "griotte-chambertin", "chapelle-chambertin", "ruchottes-chambertin", "mazoyeres-chambertin"] }],
  ["Ladoix", "Bourgogne", "R", 3, 10, "Pinot noir", "fruits rouges, épices", "RL"],
  ["Aloxe-Corton", "Bourgogne", "R", 4, 12, "Pinot noir", "fruits noirs, tanins fermes", "RL"],
  ["Corton", "Bourgogne", "R", 7, 25, "Pinot noir", "fruits noirs, épices, puissance", "RL"],
  ["Corton-Charlemagne", "Bourgogne", "B", 5, 20, "Chardonnay", "minéral, agrumes, noisette, tension", "BA", { a: ["charlemagne"] }],
  ["Pernand-Vergelesses", "Bourgogne", "B", 2, 8, "Chardonnay", "agrumes, minéral", "BV"],
  ["Pernand-Vergelesses", "Bourgogne", "R", 3, 10, "Pinot noir", "fruits rouges, fraîcheur", "RL"],
  ["Savigny-lès-Beaune", "Bourgogne", "R", 3, 10, "Pinot noir", "framboise, cerise, souplesse", "RL", { a: ["savigny-les-beaune"] }],
  ["Chorey-lès-Beaune", "Bourgogne", "R", 2, 7, "Pinot noir", "fruits rouges, gourmand", "RL", { a: ["chorey-les-beaune"] }],
  ["Beaune", "Bourgogne", "R", 4, 12, "Pinot noir", "cerise, fraise, épices douces", "RL"],
  ["Beaune", "Bourgogne", "B", 3, 10, "Chardonnay", "fruits blancs, beurre, noisette", "BA"],
  ["Côte de Beaune-Villages", "Bourgogne", "R", 3, 8, "Pinot noir", "fruits rouges", "RL"],
  ["Pommard", "Bourgogne", "R", 5, 18, "Pinot noir", "fruits noirs, épices, charpente", "RL"],
  ["Volnay", "Bourgogne", "R", 4, 15, "Pinot noir", "violette, framboise, élégance", "RL"],
  ["Monthélie", "Bourgogne", "R", 3, 10, "Pinot noir", "fruits rouges, épices", "RL"],
  ["Auxey-Duresses", "Bourgogne", "R", 3, 10, "Pinot noir", "cerise, fraîcheur", "RL"],
  ["Auxey-Duresses", "Bourgogne", "B", 2, 8, "Chardonnay", "agrumes, noisette", "BA"],
  ["Saint-Romain", "Bourgogne", "B", 2, 7, "Chardonnay", "agrumes, minéral, vif", "BV"],
  ["Meursault", "Bourgogne", "B", 3, 12, "Chardonnay", "beurre, noisette, brioche, fruits jaunes", "BA"],
  ["Puligny-Montrachet", "Bourgogne", "B", 4, 15, "Chardonnay", "fleurs blanches, amande, minéral, tension", "BA"],
  ["Chassagne-Montrachet", "Bourgogne", "B", 4, 15, "Chardonnay", "fruits jaunes, noisette, ampleur", "BA"],
  ["Chassagne-Montrachet", "Bourgogne", "R", 4, 12, "Pinot noir", "cerise, terre, structure", "RL"],
  ["Grand cru du Montrachet", "Bourgogne", "B", 8, 25, "Chardonnay", "noisette, miel, fruits secs, grande longueur", "BA", { a: ["montrachet+grand cru", "batard-montrachet", "chevalier-montrachet", "bienvenues-batard-montrachet", "criots-batard-montrachet", "le montrachet"] }],
  ["Saint-Aubin", "Bourgogne", "B", 2, 8, "Chardonnay", "agrumes, noisette, minéral", "BA"],
  ["Santenay", "Bourgogne", "R", 3, 10, "Pinot noir", "fruits noirs, tanins fermes", "RL"],
  ["Maranges", "Bourgogne", "R", 3, 8, "Pinot noir", "fruits rouges, rustique", "RL"],
  ["Rully", "Bourgogne", "B", 2, 6, "Chardonnay", "fruits blancs, fraîcheur", "BV"],
  ["Rully", "Bourgogne", "R", 2, 7, "Pinot noir", "framboise, cerise", "RL"],
  ["Mercurey", "Bourgogne", "R", 3, 10, "Pinot noir", "cerise, fruits rouges, tanins frais", "RL"],
  ["Mercurey", "Bourgogne", "B", 2, 6, "Chardonnay", "fruits blancs, noisette", "BA"],
  ["Givry", "Bourgogne", "R", 3, 8, "Pinot noir", "fruits rouges, épices", "RL"],
  ["Montagny", "Bourgogne", "B", 2, 6, "Chardonnay", "agrumes, fleurs blanches", "BV"],
  ["Mâcon", "Bourgogne", "B", 1, 4, "Chardonnay", "fruits blancs, fleurs, rondeur", "BA", { a: ["macon-villages", "macon"] }],
  ["Mâcon", "Bourgogne", "R", 1, 4, "Gamay", "fruits rouges", "RL", { a: ["macon+rouge"] }],
  ["Viré-Clessé", "Bourgogne", "B", 2, 6, "Chardonnay", "fruits jaunes, miel, rondeur", "BA"],
  ["Saint-Véran", "Bourgogne", "B", 1, 5, "Chardonnay", "fruits blancs, fleurs, minéral", "BA"],
  ["Pouilly-Fuissé", "Bourgogne", "B", 2, 8, "Chardonnay", "fruits jaunes, noisette, minéral", "BA"],
  ["Pouilly-Loché", "Bourgogne", "B", 2, 6, "Chardonnay", "fruits blancs, fleurs", "BA", { a: ["pouilly-vinzelles"] }],
  ["Crémant de Bourgogne", "Bourgogne", "E", 1, 4, "Chardonnay, Pinot noir", "brioche, pomme, agrumes", "BU", { nv: true }],

  // ---------------- Beaujolais ----------------
  ["Beaujolais", "Beaujolais", "R", 0, 2, "Gamay", "fraise, framboise, banane, gouleyant", "RL", { a: ["beaujolais nouveau", "beaujolais primeur"] }],
  ["Beaujolais-Villages", "Beaujolais", "R", 1, 3, "Gamay", "fruits rouges, croquant", "RL"],
  ["Brouilly", "Beaujolais", "R", 1, 4, "Gamay", "fruits rouges, prune, souple", "RL"],
  ["Côte de Brouilly", "Beaujolais", "R", 2, 6, "Gamay", "fruits rouges, minéral, iris", "RL"],
  ["Chiroubles", "Beaujolais", "R", 1, 4, "Gamay", "pivoine, fruits rouges, léger", "RL"],
  ["Régnié", "Beaujolais", "R", 1, 4, "Gamay", "groseille, framboise", "RL"],
  ["Fleurie", "Beaujolais", "R", 2, 6, "Gamay", "pivoine, iris, fruits rouges, finesse", "RL"],
  ["Saint-Amour", "Beaujolais", "R", 1, 5, "Gamay", "fruits rouges, épices", "RL"],
  ["Juliénas", "Beaujolais", "R", 2, 7, "Gamay", "fruits rouges, épices, structure", "RL"],
  ["Chénas", "Beaujolais", "R", 3, 8, "Gamay", "fruits noirs, rose fanée", "RL"],
  ["Morgon", "Beaujolais", "R", 3, 10, "Gamay", "kirsch, cerise, griotte, structure", "RL", { a: ["cote du py"] }],
  ["Moulin-à-Vent", "Beaujolais", "R", 4, 12, "Gamay", "cerise noire, épices, charpente", "RM", { a: ["moulin a vent"] }],

  // ---------------- Vallée du Rhône ----------------
  ["Côte-Rôtie", "Vallée du Rhône", "R", 5, 20, "Syrah, Viognier", "violette, olive noire, poivre, lard fumé", "RC", { a: ["cote rotie"] }],
  ["Condrieu", "Vallée du Rhône", "B", 1, 5, "Viognier", "abricot, pêche, violette, gras", "BR"],
  ["Château-Grillet", "Vallée du Rhône", "B", 3, 12, "Viognier", "abricot, fleurs, minéral", "BR"],
  ["Saint-Joseph", "Vallée du Rhône", "R", 3, 10, "Syrah", "fruits noirs, poivre, violette", "RM"],
  ["Saint-Joseph", "Vallée du Rhône", "B", 2, 6, "Marsanne, Roussanne", "fleurs, fruits blancs", "BA"],
  ["Crozes-Hermitage", "Vallée du Rhône", "R", 2, 8, "Syrah", "fruits noirs, poivre, fraîcheur", "RM"],
  ["Crozes-Hermitage", "Vallée du Rhône", "B", 1, 5, "Marsanne, Roussanne", "fleurs blanches, abricot", "BA"],
  ["Hermitage", "Vallée du Rhône", "R", 8, 30, "Syrah", "cassis, poivre, cuir, réglisse, puissance", "RC"],
  ["Hermitage", "Vallée du Rhône", "B", 5, 25, "Marsanne, Roussanne", "miel, noisette, coing, gras", "BA"],
  ["Cornas", "Vallée du Rhône", "R", 6, 20, "Syrah", "fruits noirs, réglisse, tanins puissants", "RC"],
  ["Saint-Péray", "Vallée du Rhône", "B", 1, 5, "Marsanne, Roussanne", "fleurs, fruits blancs", "BA"],
  ["Côtes du Rhône", "Vallée du Rhône", "R", 1, 5, "Grenache, Syrah, Mourvèdre", "fruits rouges mûrs, épices, garrigue", "RM", { a: ["cotes-du-rhone"] }],
  ["Côtes du Rhône", "Vallée du Rhône", "B", 1, 3, "Grenache blanc, Clairette, Viognier", "fruits blancs, fleurs", "BA"],
  ["Côtes du Rhône", "Vallée du Rhône", "RS", 0, 2, "Grenache, Cinsault", "fruits rouges", "RO"],
  ["Côtes du Rhône Villages", "Vallée du Rhône", "R", 2, 7, "Grenache, Syrah, Mourvèdre", "fruits noirs, épices, garrigue", "RM", { a: ["sablet", "seguret", "visan", "plan de dieu", "signargues", "massif d'uchaux", "valreas", "saint-gervais"] }],
  ["Gigondas", "Vallée du Rhône", "R", 4, 15, "Grenache, Syrah, Mourvèdre", "garrigue, fruits noirs, épices, puissance", "RC"],
  ["Vacqueyras", "Vallée du Rhône", "R", 3, 12, "Grenache, Syrah", "fruits noirs, garrigue, réglisse", "RC"],
  ["Châteauneuf-du-Pape", "Vallée du Rhône", "R", 5, 20, "Grenache, Syrah, Mourvèdre", "garrigue, kirsch, épices, cuir", "RC", { a: ["chateauneuf"] }],
  ["Châteauneuf-du-Pape", "Vallée du Rhône", "B", 2, 10, "Grenache blanc, Roussanne, Clairette", "fruits jaunes, fleurs, gras", "BA", { a: ["chateauneuf"] }],
  ["Rasteau", "Vallée du Rhône", "R", 3, 12, "Grenache, Syrah", "fruits noirs, épices, chaleur", "RC"],
  ["Cairanne", "Vallée du Rhône", "R", 3, 10, "Grenache, Syrah, Mourvèdre", "fruits noirs, garrigue", "RM"],
  ["Vinsobres", "Vallée du Rhône", "R", 3, 10, "Grenache, Syrah", "fruits rouges, épices, fraîcheur", "RM"],
  ["Beaumes-de-Venise", "Vallée du Rhône", "R", 3, 10, "Grenache, Syrah", "fruits noirs, garrigue", "RM"],
  ["Lirac", "Vallée du Rhône", "R", 3, 10, "Grenache, Syrah, Mourvèdre", "fruits noirs, épices", "RM"],
  ["Tavel", "Vallée du Rhône", "RS", 1, 4, "Grenache, Cinsault", "fruits rouges, épices, vineux", "RO"],
  ["Ventoux", "Vallée du Rhône", "R", 1, 5, "Grenache, Syrah", "fruits rouges, fraîcheur", "RM", { a: ["luberon", "grignan-les-adhemar", "duche d'uzes", "cotes du vivarais"] }],
  ["Costières de Nîmes", "Vallée du Rhône", "R", 2, 6, "Syrah, Grenache, Mourvèdre", "fruits noirs, garrigue", "RM"],
  ["Muscat de Beaumes-de-Venise", "Vallée du Rhône", "M", 1, 5, "Muscat à petits grains", "raisin frais, rose, agrumes confits", "LQ"],
  ["Rasteau vin doux naturel", "Vallée du Rhône", "M", 3, 20, "Grenache", "fruits secs, cacao, épices", "PO", { a: ["rasteau+vdn", "rasteau+doux"] }],
  ["Clairette de Die", "Vallée du Rhône", "E", 0, 2, "Muscat, Clairette", "raisin, rose, douceur", "BU", { nv: true }],

  // ---------------- Loire ----------------
  ["Muscadet", "Loire", "B", 1, 5, "Melon de Bourgogne", "iode, citron, pomme verte", "BV", { a: ["muscadet sevre et maine", "muscadet sur lie", "muscadet coteaux de la loire", "muscadet cotes de grandlieu"] }],
  ["Gros-Plant", "Loire", "B", 0, 2, "Folle blanche", "citron, très vif", "BV", { a: ["gros plant"] }],
  ["Anjou", "Loire", "R", 2, 6, "Cabernet franc, Cabernet sauvignon", "fruits rouges, poivron, souple", "RL", { a: ["anjou villages"] }],
  ["Anjou", "Loire", "B", 2, 8, "Chenin", "coing, pomme, fleurs, minéral", "BV"],
  ["Rosé d'Anjou", "Loire", "RS", 0, 2, "Grolleau, Cabernet franc", "fraise, bonbon, demi-sec", "RO", { a: ["cabernet d'anjou", "rose de loire"] }],
  ["Savennières", "Loire", "B", 4, 20, "Chenin", "coing, miel, camomille, minéral", "BA", { a: ["coulee de serrant", "roche aux moines"] }],
  ["Coteaux du Layon", "Loire", "L", 3, 20, "Chenin", "coing, abricot, miel, acidité", "LQ", { a: ["layon", "chaume"] }],
  ["Quarts de Chaume", "Loire", "L", 5, 30, "Chenin", "fruits confits, miel, safran", "LQ"],
  ["Bonnezeaux", "Loire", "L", 5, 30, "Chenin", "fruits exotiques, miel, tension", "LQ"],
  ["Coteaux de l'Aubance", "Loire", "L", 3, 15, "Chenin", "coing, fruits confits", "LQ"],
  ["Saumur", "Loire", "R", 2, 7, "Cabernet franc", "fruits rouges, violette", "RL"],
  ["Saumur", "Loire", "B", 2, 8, "Chenin", "pomme, coing, minéral", "BV"],
  ["Saumur-Champigny", "Loire", "R", 2, 8, "Cabernet franc", "framboise, violette, poivron", "RL", { a: ["saumur champigny"] }],
  ["Crémant de Loire", "Loire", "E", 1, 3, "Chenin, Chardonnay, Cabernet franc", "pomme, brioche, fraîcheur", "BU", { nv: true, a: ["saumur brut", "saumur mousseux", "vouvray petillant", "montlouis petillant"] }],
  ["Chinon", "Loire", "R", 2, 10, "Cabernet franc", "framboise, violette, graphite", "RL"],
  ["Bourgueil", "Loire", "R", 3, 10, "Cabernet franc", "fruits rouges, poivron, tanins frais", "RL"],
  ["Saint-Nicolas-de-Bourgueil", "Loire", "R", 2, 8, "Cabernet franc", "framboise, fraîcheur", "RL"],
  ["Vouvray", "Loire", "B", 2, 10, "Chenin", "coing, poire, miel, acidité", "BV"],
  ["Vouvray moelleux", "Loire", "L", 5, 30, "Chenin", "coing, miel, fruits confits", "LQ", { a: ["vouvray+moelleux", "vouvray+liquoreux", "vouvray+doux"] }],
  ["Montlouis-sur-Loire", "Loire", "B", 2, 10, "Chenin", "pomme, poire, miel, minéral", "BV", { a: ["montlouis"] }],
  ["Touraine", "Loire", "B", 1, 3, "Sauvignon", "agrumes, buis, cassis", "BV", { a: ["touraine sauvignon", "cheverny", "valencay", "touraine chenonceaux"] }],
  ["Touraine", "Loire", "R", 1, 4, "Gamay, Cabernet franc, Côt", "fruits rouges, légèreté", "RL"],
  ["Jasnières", "Loire", "B", 3, 15, "Chenin", "pomme, coing, minéral", "BV", { a: ["coteaux du loir"] }],
  ["Sancerre", "Loire", "B", 1, 5, "Sauvignon", "agrumes, silex, bourgeon de cassis", "BV"],
  ["Sancerre", "Loire", "R", 2, 7, "Pinot noir", "cerise, fraîcheur", "RL"],
  ["Sancerre", "Loire", "RS", 0, 2, "Pinot noir", "fraise, agrumes", "RO"],
  ["Pouilly-Fumé", "Loire", "B", 1, 6, "Sauvignon", "pierre à fusil, agrumes, buis", "BV", { a: ["pouilly fume", "blanc fume de pouilly"] }],
  ["Menetou-Salon", "Loire", "B", 1, 4, "Sauvignon", "agrumes, fruits blancs", "BV", { a: ["quincy", "reuilly", "coteaux du giennois"] }],
  ["Menetou-Salon", "Loire", "R", 1, 5, "Pinot noir", "fruits rouges", "RL"],

  // ---------------- Alsace ----------------
  ["Alsace Riesling", "Alsace", "B", 2, 10, "Riesling", "citron, pierre, notes pétrolées en vieillissant", "BV", { a: ["riesling+alsace", "alsace+riesling"] }],
  ["Alsace Gewurztraminer", "Alsace", "B", 2, 8, "Gewurztraminer", "litchi, rose, épices", "BR", { a: ["gewurztraminer"] }],
  ["Alsace Pinot Gris", "Alsace", "B", 2, 8, "Pinot gris", "fumé, miel, fruits jaunes", "BA", { a: ["pinot gris+alsace", "alsace+pinot gris"] }],
  ["Alsace Muscat", "Alsace", "B", 1, 4, "Muscat", "raisin frais, fleurs, sec", "BR", { a: ["muscat+alsace", "alsace+muscat"] }],
  ["Alsace Sylvaner", "Alsace", "B", 1, 3, "Sylvaner", "fruits blancs, léger", "BV", { a: ["sylvaner"] }],
  ["Alsace Pinot Blanc", "Alsace", "B", 1, 4, "Pinot blanc, Auxerrois", "pomme, fleurs, souple", "BV", { a: ["pinot blanc+alsace", "auxerrois", "edelzwicker", "gentil"] }],
  ["Alsace Pinot Noir", "Alsace", "R", 2, 6, "Pinot noir", "cerise, framboise", "RL", { a: ["pinot noir+alsace", "alsace+pinot noir", "alsace+rouge"] }],
  ["Alsace", "Alsace", "B", 2, 8, "Riesling, Pinot gris, Gewurztraminer", "fruits blancs, fleurs, aromatique", "BR"],
  ["Alsace Vendanges Tardives", "Alsace", "L", 5, 25, "Gewurztraminer, Pinot gris, Riesling", "fruits confits, miel, épices", "LQ", { a: ["vendanges tardives", "vendange tardive"] }],
  ["Alsace Sélection de Grains Nobles", "Alsace", "L", 8, 35, "Gewurztraminer, Pinot gris, Riesling", "fruits confits, miel, safran, grande liqueur", "LQ", { a: ["grains nobles", "sgn"] }],
  ["Crémant d'Alsace", "Alsace", "E", 1, 3, "Pinot blanc, Riesling, Chardonnay", "pomme, fleurs, bulles fines", "BU", { nv: true }],

  // ---------------- Champagne ----------------
  ["Champagne", "Champagne", "E", 0, 4, "Chardonnay, Pinot noir, Meunier", "brioche, pomme, agrumes, bulles fines", "BU", { nv: true, mil: [4, 15], a: ["champagne brut", "brut sans annee"] }],
  ["Champagne Blanc de Blancs", "Champagne", "E", 1, 6, "Chardonnay", "agrumes, craie, brioche, tension", "BU", { nv: true, mil: [5, 18], a: ["blanc de blancs"] }],
  ["Champagne Blanc de Noirs", "Champagne", "E", 1, 5, "Pinot noir, Meunier", "fruits rouges, brioche, vinosité", "BU", { nv: true, mil: [4, 15], a: ["blanc de noirs"] }],
  ["Champagne Rosé", "Champagne", "E", 0, 4, "Pinot noir, Chardonnay, Meunier", "fraise, groseille, agrumes", "BU", { nv: true, mil: [4, 12], a: ["champagne+rose"] }],
  ["Champagne cuvée de prestige", "Champagne", "E", 6, 25, "Chardonnay, Pinot noir", "brioche, noisette, miel, grande finesse", "BU", { a: ["dom perignon", "cristal", "krug", "grande dame", "comtes de champagne", "belle epoque", "sir winston churchill", "clos des goisses", "cuvee de prestige"] }],
  ["Coteaux Champenois", "Champagne", "R", 2, 8, "Pinot noir", "cerise, craie", "RL", { a: ["bouzy rouge"] }],
  ["Rosé des Riceys", "Champagne", "RS", 2, 8, "Pinot noir", "noisette, fruits rouges, vineux", "RO"],

  // ---------------- Jura / Savoie / Bugey ----------------
  ["Côtes du Jura", "Jura", "B", 2, 10, "Chardonnay, Savagnin", "noix, pomme, fleurs", "BA", { a: ["arbois+blanc", "l'etoile"] }],
  ["Arbois", "Jura", "R", 2, 8, "Poulsard, Trousseau, Pinot noir", "fruits rouges, épices, légèreté", "RL", { a: ["poulsard", "ploussard", "trousseau", "cotes du jura+rouge"] }],
  ["Vin Jaune", "Jura", "B", 10, 60, "Savagnin", "noix, curry, morille, épices", "BA", { a: ["chateau-chalon", "vin jaune"] }],
  ["Vin de paille du Jura", "Jura", "L", 5, 30, "Chardonnay, Savagnin, Poulsard", "fruits secs, miel, caramel", "LQ", { a: ["vin de paille"] }],
  ["Macvin du Jura", "Jura", "M", 1, 10, "Chardonnay, Savagnin", "raisin, noix, fruits secs", "PO", { a: ["macvin"] }],
  ["Crémant du Jura", "Jura", "E", 1, 4, "Chardonnay", "pomme, noisette, fraîcheur", "BU", { nv: true }],
  ["Vin de Savoie", "Savoie", "B", 1, 3, "Jacquère", "fleurs blanches, agrumes, léger", "BV", { a: ["apremont", "abymes", "chignin", "jongieux", "cruet", "savoie+blanc", "crepy", "ripaille", "marignan"] }],
  ["Chignin-Bergeron", "Savoie", "B", 2, 6, "Roussanne", "abricot, miel, fleurs", "BA", { a: ["bergeron"] }],
  ["Roussette de Savoie", "Savoie", "B", 1, 5, "Altesse", "fruits secs, fleurs, miel", "BA", { a: ["roussette", "altesse", "marestel", "frangy"] }],
  ["Mondeuse", "Savoie", "R", 2, 8, "Mondeuse", "poivre, violette, fruits noirs", "RL", { a: ["arbin", "savoie+rouge"] }],
  ["Seyssel", "Savoie", "E", 1, 3, "Altesse, Molette", "fleurs, fraîcheur", "BU", { nv: true }],
  ["Bugey Cerdon", "Bugey", "E", 0, 1, "Gamay, Poulsard", "fraise, framboise, demi-sec", "BU", { nv: true, a: ["cerdon"] }],

  // ---------------- Sud-Ouest ----------------
  ["Cahors", "Sud-Ouest", "R", 4, 15, "Malbec (Côt)", "prune, violette, réglisse, tanins fermes", "RC"],
  ["Madiran", "Sud-Ouest", "R", 5, 20, "Tannat", "cassis, mûre, épices, tanins puissants", "RC"],
  ["Pacherenc du Vic-Bilh", "Sud-Ouest", "L", 3, 15, "Petit manseng, Gros manseng", "fruits exotiques, miel", "LQ"],
  ["Jurançon", "Sud-Ouest", "L", 3, 20, "Petit manseng, Gros manseng", "ananas, mangue, épices, acidité", "LQ"],
  ["Jurançon sec", "Sud-Ouest", "B", 2, 8, "Gros manseng", "agrumes, fruits exotiques, vif", "BV", { a: ["jurancon+sec"] }],
  ["Irouléguy", "Sud-Ouest", "R", 3, 10, "Tannat, Cabernet franc", "fruits noirs, épices", "RC"],
  ["Saint-Mont", "Sud-Ouest", "R", 2, 6, "Tannat, Pinenc", "fruits noirs, rustique", "RM"],
  ["Côtes de Gascogne", "Sud-Ouest", "B", 0, 2, "Colombard, Ugni blanc, Gros manseng", "agrumes, fruits exotiques", "BV"],
  ["Gaillac", "Sud-Ouest", "R", 2, 6, "Duras, Braucol, Syrah", "fruits rouges, poivre", "RM"],
  ["Gaillac", "Sud-Ouest", "B", 1, 4, "Mauzac, Loin de l'œil", "pomme, poire, fraîcheur", "BV"],
  ["Fronton", "Sud-Ouest", "R", 1, 4, "Négrette", "violette, réglisse, fruits rouges", "RM"],
  ["Marcillac", "Sud-Ouest", "R", 2, 6, "Fer servadou (Mansois)", "cassis, poivron, poivre", "RL"],
  ["Bergerac", "Sud-Ouest", "R", 2, 6, "Merlot, Cabernets", "fruits rouges, souple", "RM", { a: ["cotes de bergerac", "cotes de duras", "cotes du marmandais", "buzet"] }],
  ["Bergerac", "Sud-Ouest", "B", 1, 3, "Sauvignon, Sémillon", "agrumes, fruits blancs", "BV"],
  ["Pécharmant", "Sud-Ouest", "R", 4, 12, "Merlot, Cabernets", "fruits noirs, structure", "RC"],
  ["Monbazillac", "Sud-Ouest", "L", 3, 20, "Sémillon, Muscadelle", "abricot, miel, agrumes confits", "LQ", { a: ["saussignac", "haut-montravel", "rosette"] }],

  // ---------------- Languedoc-Roussillon ----------------
  ["Languedoc", "Languedoc", "R", 2, 6, "Syrah, Grenache, Carignan, Mourvèdre", "fruits noirs, garrigue, épices", "RM", { a: ["coteaux du languedoc", "gres de montpellier", "pezenas", "montpeyroux", "saint-saturnin"] }],
  ["Languedoc", "Languedoc", "B", 1, 3, "Grenache blanc, Roussanne, Vermentino", "fruits blancs, fleurs", "BA"],
  ["Languedoc", "Languedoc", "RS", 0, 2, "Grenache, Cinsault, Syrah", "fruits rouges", "RO"],
  ["Pic-Saint-Loup", "Languedoc", "R", 3, 10, "Syrah, Grenache, Mourvèdre", "garrigue, fruits noirs, fraîcheur", "RC", { a: ["pic saint loup"] }],
  ["Terrasses du Larzac", "Languedoc", "R", 3, 12, "Syrah, Grenache, Mourvèdre, Carignan", "fruits noirs, garrigue, fraîcheur", "RC"],
  ["Faugères", "Languedoc", "R", 3, 10, "Syrah, Grenache, Carignan", "fruits noirs, schiste, réglisse", "RC"],
  ["Saint-Chinian", "Languedoc", "R", 3, 10, "Syrah, Grenache, Carignan", "fruits noirs, garrigue", "RC"],
  ["Minervois", "Languedoc", "R", 2, 8, "Syrah, Grenache, Carignan", "fruits noirs, épices", "RM"],
  ["Minervois-La Livinière", "Languedoc", "R", 4, 12, "Syrah, Grenache, Carignan", "fruits noirs, garrigue, profondeur", "RC", { a: ["la liviniere"] }],
  ["Corbières", "Languedoc", "R", 2, 8, "Carignan, Grenache, Syrah", "fruits noirs, garrigue, épices", "RM"],
  ["Corbières-Boutenac", "Languedoc", "R", 4, 12, "Carignan, Grenache, Mourvèdre", "fruits noirs, cuir, garrigue", "RC", { a: ["boutenac"] }],
  ["Fitou", "Languedoc", "R", 3, 10, "Carignan, Grenache", "fruits noirs, épices, garrigue", "RC"],
  ["La Clape", "Languedoc", "R", 3, 10, "Syrah, Grenache, Mourvèdre", "fruits noirs, iode, garrigue", "RM"],
  ["La Clape", "Languedoc", "B", 1, 5, "Bourboulenc, Grenache blanc", "fruits blancs, salinité", "BA"],
  ["Picpoul de Pinet", "Languedoc", "B", 0, 2, "Piquepoul", "citron, iode, très vif", "BV", { a: ["picpoul"] }],
  ["Limoux", "Languedoc", "B", 2, 6, "Chardonnay, Chenin, Mauzac", "fruits blancs, boisé léger", "BA"],
  ["Crémant de Limoux", "Languedoc", "E", 1, 3, "Chardonnay, Chenin, Mauzac", "pomme, fleurs blanches", "BU", { nv: true, a: ["blanquette de limoux", "blanquette"] }],
  ["Cabardès", "Languedoc", "R", 2, 6, "Merlot, Cabernet, Syrah, Grenache", "fruits rouges, épices", "RM", { a: ["malepere"] }],
  ["Muscat de Frontignan", "Languedoc", "M", 1, 5, "Muscat à petits grains", "raisin, agrumes confits, miel", "LQ", { a: ["muscat de lunel", "muscat de mireval", "muscat de saint-jean-de-minervois", "frontignan"] }],
  ["Pays d'Oc", "Languedoc", "R", 1, 4, "Merlot, Cabernet, Syrah", "fruits rouges, souple", "RM", { a: ["igp pays d'oc", "vin de pays d'oc"] }],
  ["Pays d'Oc", "Languedoc", "B", 0, 2, "Chardonnay, Sauvignon, Viognier", "fruits blancs, fraîcheur", "BV", { a: ["igp pays d'oc", "vin de pays d'oc"] }],
  ["Côtes du Roussillon", "Roussillon", "R", 2, 6, "Grenache, Syrah, Carignan", "fruits noirs, épices", "RM"],
  ["Côtes du Roussillon Villages", "Roussillon", "R", 3, 10, "Grenache, Syrah, Carignan", "fruits noirs, garrigue, puissance", "RC", { a: ["caramany", "latour-de-france", "lesquerde", "tautavel"] }],
  ["Côtes Catalanes", "Roussillon", "B", 1, 4, "Grenache blanc, Grenache gris, Macabeu", "fruits blancs, salinité", "BA", { a: ["cotes du roussillon+blanc"] }],
  ["Collioure", "Roussillon", "R", 3, 10, "Grenache, Mourvèdre, Syrah", "fruits noirs, épices, schiste", "RC"],
  ["Banyuls", "Roussillon", "M", 3, 30, "Grenache", "fruits secs, cacao, café, pruneau", "PO"],
  ["Banyuls Grand Cru", "Roussillon", "M", 5, 40, "Grenache", "noix, cacao, rancio, épices", "PO", { a: ["banyuls+grand cru"] }],
  ["Maury", "Roussillon", "M", 3, 30, "Grenache", "fruits noirs confits, cacao, café", "PO"],
  ["Maury sec", "Roussillon", "R", 3, 12, "Grenache, Syrah, Carignan", "fruits noirs, schiste, puissance", "RC", { a: ["maury+sec"] }],
  ["Rivesaltes", "Roussillon", "M", 3, 30, "Grenache, Macabeu", "fruits secs, caramel, épices", "PO", { a: ["rivesaltes ambre", "rivesaltes tuile"] }],
  ["Muscat de Rivesaltes", "Roussillon", "M", 1, 4, "Muscat", "agrumes, raisin, menthe", "LQ"],

  // ---------------- Provence / Corse ----------------
  ["Côtes de Provence", "Provence", "RS", 0, 2, "Grenache, Cinsault, Syrah, Tibouren", "pêche, agrumes, fruits rouges", "RO", { a: ["provence", "sainte-victoire", "la londe", "frejus", "pierrefeu", "notre-dame des anges"] }],
  ["Côtes de Provence", "Provence", "R", 2, 6, "Syrah, Grenache, Mourvèdre", "fruits noirs, garrigue", "RM", { a: ["provence"] }],
  ["Côtes de Provence", "Provence", "B", 1, 3, "Rolle (Vermentino), Ugni blanc", "agrumes, fleurs blanches", "BV", { a: ["provence"] }],
  ["Coteaux d'Aix-en-Provence", "Provence", "RS", 0, 2, "Grenache, Cinsault, Syrah", "fruits rouges, agrumes", "RO", { a: ["coteaux varois", "coteaux d'aix", "pierrevert"] }],
  ["Coteaux d'Aix-en-Provence", "Provence", "R", 2, 7, "Grenache, Syrah, Cabernet", "fruits noirs, garrigue", "RM", { a: ["coteaux d'aix", "coteaux varois"] }],
  ["Les Baux-de-Provence", "Provence", "R", 3, 10, "Grenache, Syrah, Cabernet", "fruits noirs, garrigue, olive", "RM", { a: ["baux de provence"] }],
  ["Bandol", "Provence", "R", 6, 20, "Mourvèdre, Grenache", "fruits noirs, garrigue, cuir, réglisse", "RC"],
  ["Bandol", "Provence", "RS", 1, 4, "Mourvèdre, Grenache, Cinsault", "agrumes, épices, vineux", "RO"],
  ["Bandol", "Provence", "B", 2, 6, "Clairette, Ugni blanc, Bourboulenc", "agrumes, fleurs, salinité", "BA"],
  ["Cassis", "Provence", "B", 1, 5, "Marsanne, Clairette", "agrumes, fleurs, iode", "BV"],
  ["Palette", "Provence", "R", 5, 20, "Mourvèdre, Grenache", "fruits noirs, épices", "RC"],
  ["Palette", "Provence", "B", 3, 12, "Clairette", "fleurs, fruits blancs, résine", "BA"],
  ["Bellet", "Provence", "B", 2, 6, "Rolle", "fleurs, agrumes", "BV"],
  ["Patrimonio", "Corse", "R", 3, 10, "Nielluccio", "fruits rouges, maquis, épices", "RM"],
  ["Patrimonio", "Corse", "B", 1, 5, "Vermentino", "agrumes, fleurs, salinité", "BA"],
  ["Ajaccio", "Corse", "R", 3, 8, "Sciaccarellu", "fruits rouges, poivre, maquis", "RL"],
  ["Vin de Corse", "Corse", "RS", 0, 2, "Nielluccio, Sciaccarellu", "fruits rouges, agrumes", "RO", { a: ["corse", "ile de beaute"] }],
  ["Vin de Corse", "Corse", "R", 2, 6, "Nielluccio, Sciaccarellu, Grenache", "fruits rouges, maquis", "RM", { a: ["corse", "ile de beaute"] }],
  ["Vin de Corse", "Corse", "B", 1, 3, "Vermentino", "agrumes, fleurs", "BV", { a: ["corse", "ile de beaute"] }],
  ["Muscat du Cap Corse", "Corse", "M", 1, 5, "Muscat", "raisin, agrumes confits", "LQ"],

  // ---------------- Italie ----------------
  ["Barolo", "Italie", "R", 8, 30, "Nebbiolo", "rose, goudron, cerise, réglisse, tanins puissants", "RC"],
  ["Barbaresco", "Italie", "R", 6, 25, "Nebbiolo", "rose, cerise, épices, finesse", "RC"],
  ["Langhe Nebbiolo", "Italie", "R", 3, 8, "Nebbiolo", "rose, cerise, tanins frais", "RM", { a: ["nebbiolo d'alba", "roero"] }],
  ["Gattinara", "Italie", "R", 6, 20, "Nebbiolo", "rose, fruits rouges, minéral", "RC", { a: ["ghemme", "valtellina"] }],
  ["Barbera d'Alba", "Italie", "R", 2, 8, "Barbera", "cerise, fruits noirs, acidité vive", "RM", { a: ["barbera d'asti", "barbera"] }],
  ["Dolcetto", "Italie", "R", 1, 4, "Dolcetto", "fruits noirs, amande amère", "RL"],
  ["Gavi", "Italie", "B", 1, 4, "Cortese", "agrumes, amande, minéral", "BV", { a: ["cortese di gavi"] }],
  ["Moscato d'Asti", "Italie", "E", 0, 2, "Muscat", "raisin, fleurs, pêche, sucré", "BU", { nv: true, a: ["asti spumante", "moscato"] }],
  ["Chianti", "Italie", "R", 2, 6, "Sangiovese", "cerise, violette, acidité", "RM"],
  ["Chianti Classico", "Italie", "R", 3, 12, "Sangiovese", "cerise, violette, épices, terre", "RM"],
  ["Chianti Classico Riserva", "Italie", "R", 5, 20, "Sangiovese", "cerise noire, cuir, épices", "RC", { a: ["gran selezione", "chianti+riserva"] }],
  ["Brunello di Montalcino", "Italie", "R", 8, 30, "Sangiovese", "cerise noire, cuir, tabac, terre", "RC", { a: ["brunello"] }],
  ["Rosso di Montalcino", "Italie", "R", 2, 7, "Sangiovese", "cerise, fraîcheur", "RM"],
  ["Vino Nobile di Montepulciano", "Italie", "R", 4, 15, "Sangiovese (Prugnolo gentile)", "cerise, prune, épices", "RM", { a: ["vino nobile"] }],
  ["Bolgheri", "Italie", "R", 5, 20, "Cabernet sauvignon, Merlot, Cabernet franc", "cassis, herbes méditerranéennes, cèdre", "RC", { a: ["sassicaia", "ornellaia", "super toscan", "toscana igt"] }],
  ["Morellino di Scansano", "Italie", "R", 2, 6, "Sangiovese", "cerise, fruits rouges", "RM"],
  ["Montepulciano d'Abruzzo", "Italie", "R", 2, 8, "Montepulciano", "fruits noirs, épices, rondeur", "RM"],
  ["Amarone della Valpolicella", "Italie", "R", 6, 25, "Corvina, Rondinella", "cerise confite, raisin sec, chocolat, épices", "RC", { a: ["amarone"] }],
  ["Valpolicella Ripasso", "Italie", "R", 3, 10, "Corvina, Rondinella", "cerise, fruits secs, épices", "RM", { a: ["ripasso"] }],
  ["Valpolicella", "Italie", "R", 1, 4, "Corvina, Rondinella", "cerise, fruits rouges, léger", "RL"],
  ["Recioto della Valpolicella", "Italie", "L", 4, 25, "Corvina", "cerise confite, chocolat", "LQ", { a: ["recioto"] }],
  ["Soave", "Italie", "B", 1, 4, "Garganega", "amande, fleurs blanches, poire", "BV"],
  ["Pinot Grigio", "Italie", "B", 0, 2, "Pinot gris", "poire, fleurs, léger", "BV", { a: ["delle venezie", "friuli"] }],
  ["Prosecco", "Italie", "E", 0, 2, "Glera", "poire, pomme, fleurs", "BU", { nv: true, a: ["valdobbiadene", "conegliano"] }],
  ["Franciacorta", "Italie", "E", 2, 8, "Chardonnay, Pinot noir", "brioche, agrumes, finesse", "BU", { nv: true, mil: [4, 12] }],
  ["Lambrusco", "Italie", "E", 0, 2, "Lambrusco", "fruits rouges, pétillant", "BU", { nv: true }],
  ["Verdicchio", "Italie", "B", 1, 6, "Verdicchio", "amande, agrumes, salinité", "BV"],
  ["Vermentino di Sardegna", "Italie", "B", 0, 3, "Vermentino", "agrumes, herbes, salinité", "BV", { a: ["vermentino di gallura"] }],
  ["Primitivo di Manduria", "Italie", "R", 2, 8, "Primitivo", "fruits noirs confits, épices, chaleur", "RC", { a: ["primitivo"] }],
  ["Salice Salentino", "Italie", "R", 2, 6, "Negroamaro", "fruits noirs, épices", "RM", { a: ["negroamaro"] }],
  ["Taurasi", "Italie", "R", 6, 20, "Aglianico", "fruits noirs, cuir, fumé, tanins puissants", "RC", { a: ["aglianico"] }],
  ["Etna Rosso", "Italie", "R", 3, 12, "Nerello mascalese", "cerise, minéral volcanique, finesse", "RL", { a: ["etna"] }],
  ["Nero d'Avola", "Italie", "R", 2, 6, "Nero d'Avola", "fruits noirs, épices", "RM", { a: ["sicilia"] }],
  ["Sagrantino di Montefalco", "Italie", "R", 6, 20, "Sagrantino", "fruits noirs, tanins très puissants", "RC", { a: ["sagrantino"] }],
  ["Marsala", "Italie", "M", 2, 30, "Grillo, Inzolia", "fruits secs, caramel, noix", "PO"],

  // ---------------- Espagne ----------------
  ["Rioja", "Espagne", "R", 1, 4, "Tempranillo, Garnacha", "fruits rouges, souple", "RM", { a: ["rioja joven"] }],
  ["Rioja Crianza", "Espagne", "R", 3, 8, "Tempranillo", "fruits rouges, vanille, cuir léger", "RM", { a: ["rioja+crianza"] }],
  ["Rioja Reserva", "Espagne", "R", 5, 15, "Tempranillo", "fruits secs, vanille, cuir, tabac", "RM", { a: ["rioja+reserva"] }],
  ["Rioja Gran Reserva", "Espagne", "R", 8, 25, "Tempranillo", "cuir, tabac, épices, fruits confits", "RC", { a: ["rioja+gran reserva"] }],
  ["Rioja", "Espagne", "B", 1, 6, "Viura", "fruits blancs, noisette", "BA"],
  ["Ribera del Duero", "Espagne", "R", 4, 15, "Tempranillo (Tinto fino)", "fruits noirs, boisé, tanins puissants", "RC", { a: ["ribera"] }],
  ["Toro", "Espagne", "R", 4, 15, "Tinta de Toro", "fruits noirs, chaleur, puissance", "RC"],
  ["Priorat", "Espagne", "R", 5, 20, "Garnacha, Cariñena", "fruits noirs, ardoise, réglisse", "RC", { a: ["priorato"] }],
  ["Montsant", "Espagne", "R", 2, 8, "Garnacha, Cariñena", "fruits noirs, épices", "RM"],
  ["Bierzo", "Espagne", "R", 2, 8, "Mencía", "fruits rouges, floral, minéral", "RL", { a: ["mencia", "ribeira sacra"] }],
  ["Navarra", "Espagne", "R", 2, 6, "Garnacha, Tempranillo", "fruits rouges, épices", "RM", { a: ["navarre", "calatayud", "campo de borja", "jumilla", "yecla"] }],
  ["Rías Baixas", "Espagne", "B", 1, 4, "Albariño", "agrumes, pêche, salinité", "BV", { a: ["albarino", "albarino"] }],
  ["Rueda", "Espagne", "B", 0, 2, "Verdejo", "agrumes, fenouil, herbes", "BV", { a: ["verdejo"] }],
  ["Txakoli", "Espagne", "B", 0, 2, "Hondarrabi zuri", "citron, perlant, très vif", "BV", { a: ["txakolina"] }],
  ["Cava", "Espagne", "E", 0, 3, "Macabeo, Xarel·lo, Parellada", "pomme, agrumes, amande", "BU", { nv: true }],
  ["Xérès Fino", "Espagne", "M", 0, 1, "Palomino", "amande, levure, salinité", "PO", { nv: true, a: ["fino", "manzanilla", "jerez fino", "sherry fino"] }],
  ["Xérès Amontillado", "Espagne", "M", 0, 15, "Palomino", "noisette, noix, caramel", "PO", { nv: true, a: ["amontillado"] }],
  ["Xérès Oloroso", "Espagne", "M", 0, 30, "Palomino", "noix, fruits secs, épices, rancio", "PO", { nv: true, a: ["oloroso", "palo cortado"] }],
  ["Pedro Ximénez", "Espagne", "M", 0, 30, "Pedro Ximénez", "raisin sec, figue, mélasse", "PO", { nv: true, a: ["pedro ximenez", "px"] }],

  // ---------------- Portugal ----------------
  ["Porto Ruby", "Portugal", "M", 0, 5, "Touriga nacional, Tinta roriz", "fruits rouges confits, cerise, épices", "PO", { nv: true, a: ["porto", "ruby", "port"] }],
  ["Porto Tawny", "Portugal", "M", 0, 10, "Touriga nacional, Tinta roriz", "fruits secs, caramel, noix", "PO", { nv: true, a: ["tawny", "porto+10 ans", "porto+20 ans", "colheita"] }],
  ["Porto LBV", "Portugal", "M", 2, 12, "Touriga nacional, Touriga franca", "fruits noirs, épices, chocolat", "PO", { a: ["late bottled vintage", "lbv"] }],
  ["Porto Vintage", "Portugal", "M", 15, 50, "Touriga nacional, Touriga franca", "fruits noirs, violette, épices, grande garde", "PO", { a: ["porto+vintage", "vintage port"] }],
  ["Porto blanc", "Portugal", "M", 0, 5, "Malvasia, Gouveio", "fruits secs, miel", "PO", { nv: true, a: ["porto blanc", "white port"] }],
  ["Douro", "Portugal", "R", 3, 12, "Touriga nacional, Touriga franca, Tinta roriz", "fruits noirs, violette, épices", "RC"],
  ["Dão", "Portugal", "R", 3, 12, "Touriga nacional, Jaen", "fruits rouges, floral, résine", "RM", { a: ["dao", "bairrada"] }],
  ["Alentejo", "Portugal", "R", 2, 6, "Aragonez, Trincadeira, Alicante Bouschet", "fruits noirs mûrs, épices", "RM"],
  ["Vinho Verde", "Portugal", "B", 0, 2, "Alvarinho, Loureiro", "agrumes, perlant, léger", "BV"],
  ["Madère", "Portugal", "M", 5, 50, "Sercial, Verdelho, Bual, Malvasia", "noix, caramel, agrumes confits, acidité", "PO", { nv: true, a: ["madeira", "madere"] }],

  // ---------------- Allemagne / Autriche / Suisse / Hongrie ----------------
  ["Riesling Kabinett", "Allemagne", "B", 2, 12, "Riesling", "pomme verte, citron, ardoise, légère douceur", "BR", { a: ["kabinett", "mosel", "moselle allemande", "saar", "ruwer"] }],
  ["Riesling Spätlese", "Allemagne", "B", 3, 20, "Riesling", "pêche, agrumes, miel, ardoise", "BR", { a: ["spatlese"] }],
  ["Riesling Auslese", "Allemagne", "L", 5, 30, "Riesling", "abricot, miel, fruits exotiques", "LQ", { a: ["auslese"] }],
  ["Beerenauslese / Trockenbeerenauslese", "Allemagne", "L", 10, 50, "Riesling", "fruits confits, miel, grande acidité", "LQ", { a: ["beerenauslese", "trockenbeerenauslese", "eiswein", "tba"] }],
  ["Riesling trocken", "Allemagne", "B", 2, 10, "Riesling", "citron, pêche, minéral", "BV", { a: ["trocken", "grosses gewachs", "rheingau", "pfalz", "nahe", "rheinhessen"] }],
  ["Spätburgunder", "Allemagne", "R", 2, 8, "Pinot noir", "cerise, fumé, finesse", "RL", { a: ["spatburgunder"] }],
  ["Grüner Veltliner", "Autriche", "B", 1, 6, "Grüner Veltliner", "poivre blanc, agrumes, pois", "BV", { a: ["gruner veltliner", "kamptal", "kremstal"] }],
  ["Wachau Riesling", "Autriche", "B", 2, 12, "Riesling", "pêche, abricot, minéral", "BV", { a: ["wachau", "smaragd"] }],
  ["Blaufränkisch", "Autriche", "R", 2, 10, "Blaufränkisch", "fruits noirs, épices, fraîcheur", "RM", { a: ["blaufrankisch", "burgenland"] }],
  ["Zweigelt", "Autriche", "R", 1, 4, "Zweigelt", "cerise, fruits rouges, souple", "RL"],
  ["Chasselas", "Suisse", "B", 1, 3, "Chasselas", "fleurs, tilleul, léger", "BV", { a: ["fendant", "lavaux", "dezaley"] }],
  ["Dôle", "Suisse", "R", 1, 4, "Pinot noir, Gamay", "fruits rouges, léger", "RL", { a: ["dole"] }],
  ["Petite Arvine", "Suisse", "B", 2, 8, "Petite arvine", "pamplemousse, glycine, salinité", "BV", { a: ["petite arvine"] }],
  ["Tokaji Aszú", "Hongrie", "L", 5, 50, "Furmint, Hárslevelű", "abricot, orange confite, miel, acidité", "LQ", { a: ["tokaji", "tokaj", "aszu"] }],

  // ---------------- Nouveau monde ----------------
  ["Napa Valley Cabernet Sauvignon", "États-Unis", "R", 5, 20, "Cabernet sauvignon", "cassis, mûre, vanille, puissance", "RC", { a: ["napa", "napa valley"] }],
  ["Sonoma", "États-Unis", "R", 3, 10, "Cabernet, Zinfandel, Pinot noir", "fruits mûrs, épices", "RM"],
  ["Zinfandel", "États-Unis", "R", 2, 8, "Zinfandel", "confiture de fruits rouges, poivre, chaleur", "RC"],
  ["Californie Chardonnay", "États-Unis", "B", 2, 6, "Chardonnay", "fruits jaunes, beurre, vanille", "BA", { a: ["california+chardonnay", "californie+chardonnay"] }],
  ["Oregon Pinot Noir", "États-Unis", "R", 2, 8, "Pinot noir", "cerise, terre, épices", "RL", { a: ["willamette", "oregon"] }],
  ["Mendoza Malbec", "Argentine", "R", 2, 10, "Malbec", "prune, violette, chocolat, velouté", "RC", { a: ["mendoza", "malbec+argentine", "uco"] }],
  ["Torrontés", "Argentine", "B", 0, 2, "Torrontés", "rose, muscat, agrumes", "BR", { a: ["torrontes", "salta"] }],
  ["Maipo Cabernet Sauvignon", "Chili", "R", 3, 12, "Cabernet sauvignon", "cassis, menthe, eucalyptus", "RC", { a: ["maipo", "colchagua", "rapel"] }],
  ["Carmenère", "Chili", "R", 2, 8, "Carmenère", "poivron, fruits noirs, épices", "RM", { a: ["carmenere"] }],
  ["Casablanca Sauvignon Blanc", "Chili", "B", 0, 2, "Sauvignon", "agrumes, herbes, fruit de la passion", "BV", { a: ["casablanca", "leyda"] }],
  ["Barossa Shiraz", "Australie", "R", 3, 15, "Shiraz (Syrah)", "fruits noirs confits, chocolat, eucalyptus", "RC", { a: ["barossa", "mclaren vale", "shiraz"] }],
  ["Coonawarra Cabernet Sauvignon", "Australie", "R", 4, 15, "Cabernet sauvignon", "cassis, menthe, terre rouge", "RC", { a: ["coonawarra", "margaret river"] }],
  ["Hunter Valley Sémillon", "Australie", "B", 5, 20, "Sémillon", "citron, toast, miel en vieillissant", "BV", { a: ["hunter valley"] }],
  ["Clare Valley Riesling", "Australie", "B", 2, 12, "Riesling", "citron vert, minéral", "BV", { a: ["clare valley", "eden valley"] }],
  ["Marlborough Sauvignon Blanc", "Nouvelle-Zélande", "B", 0, 3, "Sauvignon", "fruit de la passion, buis, agrumes", "BR", { a: ["marlborough"] }],
  ["Central Otago Pinot Noir", "Nouvelle-Zélande", "R", 2, 8, "Pinot noir", "cerise, épices, fraîcheur", "RL", { a: ["central otago", "martinborough"] }],
  ["Stellenbosch", "Afrique du Sud", "R", 3, 12, "Cabernet sauvignon, Merlot", "cassis, fruits noirs, épices", "RC", { a: ["stellenbosch", "paarl", "franschhoek"] }],
  ["Pinotage", "Afrique du Sud", "R", 2, 8, "Pinotage", "fruits noirs, fumé, banane", "RM"],
  ["Chenin blanc d'Afrique du Sud", "Afrique du Sud", "B", 1, 5, "Chenin", "fruits jaunes, miel, fraîcheur", "BA", { a: ["swartland", "chenin+afrique"] }],
  ["Bekaa", "Liban", "R", 4, 15, "Cabernet, Cinsault, Carignan", "fruits noirs, épices, cuir", "RC", { a: ["liban", "musar"] }],
  ["Santorin Assyrtiko", "Grèce", "B", 2, 8, "Assyrtiko", "citron, minéral volcanique, salinité", "BV", { a: ["santorini", "santorin", "assyrtiko"] }],
  ["Naoussa", "Grèce", "R", 4, 15, "Xinomavro", "tomate séchée, cerise, épices", "RC", { a: ["xinomavro"] }],

  // ---------------- Repli par grande région (sans appellation reconnue) ----------------
  ["Bordeaux (région)", "Bordeaux", "R", 3, 10, "Merlot, Cabernet sauvignon", "cassis, prune", "RM", { region: true, a: ["bordeaux"] }],
  ["Bourgogne (région)", "Bourgogne", "R", 3, 10, "Pinot noir", "cerise, framboise", "RL", { region: true, a: ["bourgogne", "burgundy"] }],
  ["Bourgogne (région)", "Bourgogne", "B", 2, 6, "Chardonnay", "fruits blancs, noisette", "BA", { region: true, a: ["bourgogne", "burgundy"] }],
  ["Vallée du Rhône (région)", "Vallée du Rhône", "R", 2, 8, "Syrah, Grenache", "fruits noirs, épices", "RM", { region: true, a: ["rhone"] }],
  ["Loire (région)", "Loire", "R", 2, 7, "Cabernet franc", "fruits rouges", "RL", { region: true, a: ["loire"] }],
  ["Loire (région)", "Loire", "B", 1, 5, "Chenin, Sauvignon", "agrumes, pomme", "BV", { region: true, a: ["loire"] }],
  ["Languedoc (région)", "Languedoc", "R", 2, 6, "Syrah, Grenache, Carignan", "fruits noirs, garrigue", "RM", { region: true, a: ["languedoc"] }],
  ["Sud-Ouest (région)", "Sud-Ouest", "R", 2, 8, "Malbec, Tannat, Merlot", "fruits noirs", "RM", { region: true, a: ["sud-ouest", "sud ouest"] }],
  ["Provence (région)", "Provence", "RS", 0, 2, "Grenache, Cinsault", "pêche, agrumes", "RO", { region: true, a: ["provence"] }],
  ["Alsace (région)", "Alsace", "B", 2, 8, "Riesling, Pinot gris, Gewurztraminer", "fruits blancs, fleurs", "BR", { region: true, a: ["alsace"] }],
  ["Italie (région)", "Italie", "R", 2, 8, "Sangiovese, Nebbiolo, Barbera", "cerise, épices", "RM", { region: true, a: ["italie", "italy"] }],
  ["Espagne (région)", "Espagne", "R", 2, 8, "Tempranillo, Garnacha", "fruits rouges, vanille", "RM", { region: true, a: ["espagne", "spain"] }],
];

export const STYLE_PROFILES = {
  RL: "rougeLeger", RM: "rougeMoyen", RC: "rougeCorse", BV: "blancVif", BA: "blancAmple", BR: "blancAromatique",
  LQ: "liquoreux", RO: "rose", BU: "bulles", PO: "porto",
};
export const COLOR_LABELS = { R: "rouge", B: "blanc", RS: "rosé", E: "effervescent", L: "liquoreux", M: "muté" };

const norm = (s) => ` ${String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim()} `;

export const REFERENCE = RAW.map(([name, region, color, de, ja, cepages, aromes, style, o = {}]) => ({
  name, region, color, de, ja, cepages, aromes, style, profile: STYLE_PROFILES[style],
  nv: Boolean(o.nv), mil: o.mil || null, regionOnly: Boolean(o.region),
  keys: [...(o.region ? [] : [name]), ...(o.a || [])].map((k) => k.split("+").map((t) => norm(t))),
}));

// Appellations proposées à la saisie (liste sans doublons, hors replis régionaux).
export const APPELLATIONS = [...new Set(REFERENCE.filter((r) => !r.regionOnly).map((r) => r.name))]
  .sort((a, b) => a.localeCompare(b, "fr"));

// Couleurs admises pour une catégorie de la cave.
function colorsFor(category) {
  const c = norm(category);
  if (c.includes(" rouge ")) return ["R"];
  if (c.includes(" rose ")) return ["RS", "E"];
  if (c.includes(" blanc ")) return ["B", "L", "E"];
  if (c.includes(" champagne ") || c.includes(" effervescent ") || c.includes(" cremant ") || c.includes(" petillant ")) return ["E"];
  if (c.includes(" porto ") || c.includes(" xeres ") || c.includes(" madere ") || c.includes(" muscat ")) return ["M", "L"];
  if (c.includes(" liquoreux ") || c.includes(" moelleux ")) return ["L", "M"];
  return null; // catégorie personnalisée : toutes les couleurs
}

// Mentions qui allongent la garde (jamais appliquées si l'appellation les contient déjà).
const MODIFIERS = [
  { t: [" grand cru classe ", " premier grand cru ", " 1er grand cru "], de: 2, k: 1.3 },
  { t: [" grand cru "], de: 2, k: 1.3 },
  { t: [" premier cru ", " 1er cru "], de: 1, k: 1.15 },
  { t: [" cru classe ", " cru bourgeois exceptionnel "], de: 2, k: 1.25 },
  { t: [" vieilles vignes ", " vv "], de: 0, k: 1.1 },
];

const cache = new Map();

// Meilleure référence pour une bouteille (ou null). Les mots trouvés dans l'appellation ou la cuvée
// comptent davantage que ceux trouvés dans la région ou les cépages ; à égalité, le nom le plus long.
export function findReference(w) {
  const key = [w.category, w.appellation, w.region, w.cuvee, w.cepages].join("|");
  if (cache.has(key)) return cache.get(key);
  const app = norm(w.appellation);
  const cuvee = norm(w.cuvee);
  const all = norm([w.appellation, w.region, w.cuvee, w.cepages].join(" "));
  const colors = colorsFor(w.category);
  let best = null;
  let bestScore = -Infinity;
  for (const r of REFERENCE) {
    if (colors && !colors.includes(r.color)) continue;
    for (const tokens of r.keys) {
      if (!tokens.every((t) => all.includes(t))) continue;
      const len = tokens.reduce((n, t) => n + t.length, 0);
      const score = len + (tokens.some((t) => app.includes(t) || cuvee.includes(t)) ? 1000 : 0) - (r.regionOnly ? 500 : 0);
      if (score > bestScore) { best = r; bestScore = score; }
    }
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, best);
  return best;
}

// Fenêtre de dégustation [de, jusqu'à] (années) d'après la référence, ou null.
// `entryYear` sert de point de départ pour un vin sans millésime (champagne brut sans année…).
export function referenceWindow(w, entryYear) {
  const r = findReference(w);
  if (!r) return null;
  let base = w.millesime;
  let [de, ja] = [r.de, r.ja];
  if (base && r.mil) [de, ja] = r.mil;
  if (!base) {
    if (!r.nv || !entryYear) return null;
    base = entryYear;
  }
  const text = norm([w.appellation, w.cuvee].join(" "));
  const own = norm(r.name);
  for (const m of MODIFIERS) {
    if (m.t.some((t) => text.includes(t) && !own.includes(t))) {
      de += m.de;
      ja = Math.round(ja * m.k);
      break;
    }
  }
  return { de: base + de, ja: base + Math.max(ja, de + 1), ref: r };
}
