/**
 * CONTENU — à modifier ici.
 *
 * id        doit correspondre au nom de l'écran dans Blender : SCREEN_<id>
 * runtime   durée du film en secondes (null = pas de durée) → longueur du trait dans l'index
 * durationNote  texte affiché à la place d'une durée (installation, stage…)
 * format    '16:9' | '2.39:1' | '4:3' | '9:16' …
 * media     fichiers produits par tools/media/encode.sh ou stills.sh (aperçu ≤ 2 Mo, affiche, planche)
 * gallery   images de la fiche (assets/gallery/…)
 * link      film complet hébergé ailleurs (YouTube, Vimeo…) — jamais sur le serveur statique
 *
 * ⚠ Dans les textes, utiliser l'apostrophe typographique ’ (jamais ' qui couperait le texte).
 */
const media = (id, frames = 48, cols = 8) => ({
  preview: `assets/video/${id}.mp4`,
  poster: `assets/posters/${id}.webp`,
  sprite: { src: `assets/sprites/${id}.webp`, frames, cols },
});
const gallery = (id, n) => Array.from({ length: n }, (_, i) => `assets/gallery/${id}-${i + 1}.jpg`);

export const WORKS = [
  {
    id: 'fotozofio', year: '2025', runtime: 15, format: '16:9',
    link: 'https://youtu.be/-VAjg6rEHGI', media: media('fotozofio'), gallery: gallery('fotozofio', 3),
    title: { fr: 'FOTOZOFIO', ja: 'FOTOZOFIO', en: 'FOTOZOFIO' },
    kind: { fr: 'Publicité · métro de Kyoto', ja: 'CM・京都市営地下鉄', en: 'Advertising · Kyoto subway' },
    body: {
      fr: 'FOTOZOFIO est un projet de photographie et d’image en mouvement ouvert aux artistes de plus de cinquante ans, du monde entier. Ce spot annonçait sa première exposition à Kyoto. Il est construit uniquement à partir des photographies reçues, réparties sur trois panneaux pour épouser la largeur du couloir de métro où il était diffusé. Le logo animé donne aux passants un point fixe à saisir au vol.',
      ja: 'FOTOZOFIOは、世界中の50歳以上のアーティストを対象とした写真・映像プロジェクトです。このCMは京都での初の展覧会を告知するもの。応募された写真だけで構成し、放映された地下鉄通路の幅に合わせて3面に展開しました。アニメーションロゴは、通り過ぎる人々の視線をとらえる固定点になっています。',
      en: 'FOTOZOFIO is a photography and moving-image project for artists over fifty, open to submissions worldwide. The spot announced its first Kyoto exhibition. Built entirely from submitted photographs, it is laid out across three panels to match the width of the subway corridor where it played. The animated logo gives commuters a fixed point to catch as they pass.' },
    facts: {
      fr: [['Rôle', 'Montage, animation du logo (After Effects), mise en page sur trois écrans'], ['Outils', 'Premiere Pro, After Effects'], ['Musique', 'Composition originale de Cosmo Bocquet'], ['Diffusion', 'Station Karasuma Oike, Kyoto — avril–mai 2025']],
      ja: [['担当', '編集、ロゴアニメーション（After Effects）、3面レイアウト'], ['ツール', 'Premiere Pro、After Effects'], ['音楽', 'Cosmo Bocquetによるオリジナル楽曲'], ['放映', '京都市営地下鉄 烏丸御池駅（2025年4〜5月）']],
      en: [['Role', 'Editor, logo animation (After Effects), three-screen layout'], ['Tools', 'Premiere Pro, After Effects'], ['Music', 'Original score by Cosmo Bocquet'], ['Placement', 'Karasuma Oike station, Kyoto — Apr–May 2025']] },
  },
  {
    id: 'ack', year: '2025', runtime: null, format: '16:9', short: 'ACK',
    durationNote: { fr: '3 jours', ja: '3日間', en: '3 days' },
    link: 'https://www.youtube.com/watch?v=DHGrfQn77QA',
    linkLabel: { fr: 'Film de l’équipe vidéo ACK', ja: 'ACK映像チームによる記録映像', en: 'Film by the ACK video team' },
    media: media('ack', 3, 3), gallery: gallery('ack', 4),
    title: { fr: 'Art Collaboration Kyoto 2025', ja: 'Art Collaboration Kyoto 2025', en: 'Art Collaboration Kyoto 2025' },
    kind: { fr: 'Captation · cadreur', ja: '記録映像・カメラオペレーター', en: 'Video documentation · camera operator' },
    body: {
      fr: 'Art Collaboration Kyoto est une foire d’art contemporain fondée sur la collaboration entre galeries japonaises et internationales : 72 galeries de 19 pays et plus de 30 000 visiteurs pour sa cinquième édition. Pendant trois jours, j’ai cadré sur le dispositif de cinq caméras des ACK Talks, en recadrant sur les indications du mélangeur, et géré les médias entre les sessions. Le direct ne laisse aucune place à l’hésitation : le cadre doit être juste quand la régie l’appelle, et les médias en sécurité avant la session suivante.',
      ja: 'Art Collaboration Kyotoは、国内外のギャラリーの協働を軸にした現代アートフェアです。第5回は19か国72ギャラリーが参加し、3万人以上が来場しました。3日間、ACK Talksを撮影する5台のカメラ体制でスイッチャーの指示に合わせてフレーミングを調整し、セッションの合間にはメディア管理を担当しました。ライブのマルチカムでは迷う余地がありません。呼ばれた瞬間に画が決まっていること、次のセッションまでにデータが守られていること。常に一歩先を考えることを学びました。',
      en: 'Art Collaboration Kyoto is a contemporary art fair built on collaboration between Japanese and international galleries; its fifth edition gathered 72 galleries from 19 countries and drew over 30,000 visitors. Over three days I operated one of five cameras for the ACK Talks, reframing on cue from the vision mixer, and handled media between sessions. Live multi-camera work leaves no room for hesitation: the frame has to be right when the mixer calls for it, and the media has to be safe before the next session starts.' },
    facts: {
      fr: [['Rôle', 'Cadreur, multicam en direct ; gestion des médias (déchargement, sauvegarde, dérushage)'], ['Matériel', '5 × Panasonic Lumix sur têtes fluides'], ['Outils', 'DaVinci Resolve'], ['Lieu', 'Kyoto International Conference Center — novembre 2025']],
      ja: [['担当', 'ライブマルチカムのカメラオペレーター、メディア管理（取り込み・バックアップ・ログ）'], ['機材', 'Panasonic Lumix ×5（フルードヘッド）'], ['ツール', 'DaVinci Resolve'], ['会場', '国立京都国際会館（2025年11月）']],
      en: [['Role', 'Camera operator, live multicam; media management (offload, backup, logging)'], ['Kit', '5 × Panasonic Lumix on fluid heads'], ['Tools', 'DaVinci Resolve'], ['Venue', 'Kyoto International Conference Center — November 2025']] },
  },
  {
    id: 'nhk', year: '2024', runtime: null, format: '16:9', link: '',
    durationNote: { fr: '8 semaines', ja: '8週間', en: '8 weeks' },
    media: media('nhk', 2, 2), gallery: gallery('nhk', 2),
    title: { fr: 'NHK Osaka', ja: 'NHK大阪放送局', en: 'NHK Osaka' },
    kind: { fr: 'Stage · montage du journal', ja: 'インターン・ニュース編集', en: 'Internship · news editing' },
    body: {
      fr: 'Huit semaines au service information de NHK Osaka, qui produit l’actualité du Kansai pour le réseau national. J’ai monté un sujet par jour pour le journal du soir News Hot Kansai, image et son, à partir du script, en suivant toute la chaîne de la rédaction : visionnage des rushes, montage, transmission à la diffusion, archivage. Monter pour le jour même dans une chaîne de validation, où un responsable puis le présentateur approuvent avant l’antenne, oblige à pouvoir justifier chaque plan.',
      ja: 'NHK大阪放送局の報道部で8週間のインターンシップ。夕方のニュース番組「ニュースほっと関西」の項目を、原稿をもとに映像・音声ともに毎日1本編集しました。素材チェックから構成、放送への送出、アーカイブ登録まで、編集デスクと同じ流れを担当。当日放送の締め切りの中、デスクとキャスターの確認を経て放送されるため、一つひとつのカットに根拠が求められました。',
      en: 'Eight weeks in the news department of NHK Osaka, which produces the Kansai region’s output for the national network. I cut one segment a day for the evening bulletin News Hot Kansai, image and sound, from script, running the full newsroom pipeline: rush review, story assembly, broadcast delivery, archival logging. Cutting on a same-day deadline inside a chain of approval, where a supervisor and the on-air presenter both sign off, means every shot has to be defensible.' },
    facts: {
      fr: [['Rôle', 'Monteur, journal du soir (News Hot Kansai)'], ['Système', 'PRUNUS 4 (Sakura Eiki), montage 4K HDR'], ['Livraison', '1080p/30'], ['Période', 'Juillet–septembre 2024']],
      ja: [['担当', '編集（ニュースほっと関西）'], ['システム', 'PRUNUS 4（桜映機）4K HDR編集'], ['納品', '1080p/30'], ['期間', '2024年7月〜9月']],
      en: [['Role', 'Video editor, evening bulletin (News Hot Kansai)'], ['System', 'PRUNUS 4 (Sakura Eiki), 4K HDR editing'], ['Delivery', '1080p/30'], ['Period', 'July–September 2024']] },
  },
  {
    id: 'entre', year: '2025', runtime: 720, format: '2.39:1',
    link: 'https://youtu.be/S62W7qapmEw', media: media('entre', 5, 5), gallery: gallery('entre', 4),
    title: { fr: 'Entre ici et là', ja: 'Entre ici et là', en: 'Entre ici et là' },
    kind: { fr: 'Documentaire · un film de Noam Baumard', ja: 'ドキュメンタリー・監督 Noam Baumard', en: 'Documentary · a film by Noam Baumard' },
    body: {
      fr: 'Portrait documentaire de Madame Cerdan, une femme âgée qui retrace les lieux qui l’ont faite. On entend sa voix, on ne la voit jamais. La caméra s’attarde sur des espaces vides et laisse la lumière naturelle porter le passage du temps. Les passants ont été effacés en postproduction, pour que chaque lieu reste plus proche du souvenir qu’elle en décrit.',
      ja: '年老いたセルダンさんが、自分をかたちづくった場所をたどるドキュメンタリー。声は聞こえるが、姿は一度も映らない。カメラは誰もいない空間にとどまり、自然光に時間の流れを託す。通行人はポストプロダクションで消去し、それぞれの場所を彼女の語る記憶に近づけました。',
      en: 'A documentary portrait of Madame Cerdan, an elderly woman retracing the places that shaped her. Her voice is heard; she is never seen. The camera holds on empty spaces and lets natural light carry the passage of time. Passers-by were removed in post to keep each place closer to the memory she describes.' },
    facts: {
      fr: [['Rôle', 'Scripte (3 jours de tournage), monteur image, nettoyage VFX (passants effacés)'], ['Image', 'Sony FS7, acquisition 4K, master 2K ; tourné en 1.85, recadré en 2.39'], ['Outils', 'Avid Media Composer, DaVinci Resolve, After Effects'], ['Film', '12 min, 6 lieux, Montpellier']],
      ja: [['担当', 'スクリプター（撮影3日間）、編集、VFX（通行人の消去）'], ['撮影', 'Sony FS7・4K収録・2Kマスター／1.85で撮影し2.39にリフレーム'], ['ツール', 'Avid Media Composer、DaVinci Resolve、After Effects'], ['作品', '12分・6か所・モンペリエ']],
      en: [['Role', 'Script supervisor (3 shooting days), picture editor, VFX cleanup (passers-by removed)'], ['Image', 'Sony FS7, 4K acquisition, 2K master; shot 1.85, reframed to 2.39'], ['Tools', 'Avid Media Composer, DaVinci Resolve, After Effects'], ['Film', '12 min, 6 locations, Montpellier']] },
  },
  {
    id: 'ts', year: '2026', runtime: null, format: '16:9', link: '', short: '“I”',
    durationNote: { fr: 'Une soirée', ja: '一夜限り', en: 'One night' },
    media: media('ts'), gallery: gallery('ts', 3),
    title: { fr: '“I” — exposition du séminaire Tsumura', ja: '「I」津村ゼミ展', en: '“I” — Tsumura seminar exhibition' },
    kind: { fr: 'Création sonore · défilé', ja: '音源制作・ファッションショー', en: 'Sound production · fashion show' },
    body: {
      fr: 'Soirée immersive du séminaire Tsumura (Musashino Art University) au KITSUNE, à Shibuya : défilé, DJ et performances autour d’un thème unique, « I » — le soi, l’amour (ai) et le regard (eye) porté sur la société. Le public y devient une partie de l’espace. Ma contribution : la création sonore (音源制作).',
      ja: '津村ゼミ（武蔵野美術大学）による渋谷KITSUNEでの一夜限りの没入型イベント。「I」をテーマに、自分（I）、愛（アイ）、社会へ向ける視線（EYE）を、ファッションショー、DJ、ライブパフォーマンスで表現しました。観客もまた空間の一部になります。音源制作を担当しました。',
      en: 'A one-night immersive event by the Tsumura seminar (Musashino Art University) at KITSUNE, Shibuya: fashion show, DJ sets and live performance around a single theme, “I” — the self, love (ai) and the gaze (eye) cast on society. The audience becomes part of the space. My part: sound production (音源制作).' },
    facts: {
      fr: [['Rôle', 'Création sonore (音源制作)'], ['Lieu', 'Dining & bar KITSUNE, Shibuya'], ['Date', '18 juillet 2026']],
      ja: [['担当', '音源制作'], ['会場', 'dining & bar KITSUNE（渋谷）'], ['日程', '2026年7月18日']],
      en: [['Role', 'Sound production (音源制作)'], ['Venue', 'Dining & bar KITSUNE, Shibuya'], ['Date', '18 July 2026']] },
  },
  {
    id: 'ma', year: '2026', runtime: 159, format: '4:3', link: '', short: '相互浸透',
    media: media('ma'), gallery: gallery('ma', 4),
    title: { fr: '妨害なき相互浸透', ja: '妨害なき相互浸透', en: '妨害なき相互浸透' },
    kind: { fr: 'Art vidéo · Musabi', ja: 'メディアアート・武蔵野美術大学', en: 'Video art · Musabi' },
    body: {
      fr: '« Interpénétration sans entrave ». Un film sur l’identité et l’environnement, construit sur l’effet Koulechov : des visages neutres alternent avec des plans de la ville, et c’est le montage qui leur prête une émotion. La bande-son mêle bruit, synthétiseur et sons de gares de la ligne Yamanote retravaillés (distributeurs, passages piétons) ; le son change la lecture de l’image.',
      ja: 'アイデンティティと環境をテーマに、クレショフ効果を軸にした映像作品。人の真顔と街のショットを交互につなぎ、感情を与えるのは編集そのもの。ノイズ、シンセ、山手線の駅で録音した自販機や信号機の音を加工したサウンドが、画の見え方を変えていきます。',
      en: '“Unhindered interpenetration”. A film about identity and environment, built on the Kuleshov effect: neutral faces alternate with shots of the city, and the cut is what gives them emotion. The soundtrack mixes noise, synthesiser and reworked field recordings from Yamanote line stations (vending machines, crossings); the sound changes how the image reads.' },
    facts: {
      fr: [['Rôle', 'Réalisation, image, montage, son'], ['Références', 'Effet Koulechov ; John Cage, Robert Ashley'], ['Cadre', 'Cours de media art, Musashino Art University']],
      ja: [['担当', '企画・撮影・編集・音'], ['参照', 'クレショフ効果、ジョン・ケージ、ロバート・アシュリー'], ['授業', 'メディアアート制作（武蔵野美術大学）']],
      en: [['Role', 'Direction, camera, editing, sound'], ['References', 'Kuleshov effect; John Cage, Robert Ashley'], ['Context', 'Media art course, Musashino Art University']] },
  },
  {
    id: 'terra', year: '2026', runtime: null, format: '16:9', link: '',
    durationNote: { fr: 'Installation en boucle', ja: 'ループ展示', en: 'Looping installation' },
    media: media('terra'), gallery: gallery('terra', 2),
    title: { fr: 'Terra', ja: 'Terra', en: 'Terra' },
    kind: { fr: 'Projection sur cube · Musabi', ja: 'キューブへの投影・映像空間', en: 'Projection on a cube · Musabi' },
    body: {
      fr: 'Une archive de la Terre vue depuis un futur lointain, projetée sur un cube de 10 cm. Six chapitres en boucle : naissance de la planète, révolution industrielle, société numérique, montée des eaux, assèchement, effondrement — puis retour au noir et à l’origine. Le spectateur est placé en humain du futur qui examine ce que nos choix ont fait de la planète.',
      ja: '遠い未来から振り返る「地球の歴史アーカイブ」を、一辺100mmのキューブに投影した作品。地球誕生、産業革命、デジタル社会、海面上昇、水枯渇、崩壊の6章がループします。鑑賞者は「未来の人類」として、人類の選択が地球に何をもたらしたかを見つめ直します。',
      en: 'An archive of the Earth seen from the distant future, projected onto a 10 cm cube. Six chapters in a loop: the planet’s birth, the industrial revolution, digital society, rising seas, drought, collapse — then back to black and to the beginning. The viewer stands as a future human examining what our choices did to the planet.' },
    facts: {
      fr: [['Rôle', 'Concept, modélisation 3D, animation, projection'], ['Outils', 'Blender, After Effects'], ['Support', 'Cube de 100 mm, projection'], ['Cadre', 'Cours Espace et image (映像空間 IIA), Musashino Art University — juillet 2026']],
      ja: [['担当', '企画・3Dモデリング・アニメーション・投影'], ['ツール', 'Blender、After Effects'], ['支持体', '一辺100mmのキューブへの投影'], ['授業', '映像空間IIA（武蔵野美術大学）2026年7月']],
      en: [['Role', 'Concept, 3D modelling, animation, projection'], ['Tools', 'Blender, After Effects'], ['Support', '100 mm cube, projection'], ['Context', 'Image & Space course (映像空間 IIA), Musashino Art University — July 2026']] },
  },
  {
    id: 'muhi', year: '2026', runtime: 41, format: '4:3',
    link: 'https://youtu.be/uBwLP72bENM', media: media('muhi'), gallery: gallery('muhi', 2),
    title: { fr: 'MUHI — Backrooms', ja: 'MUHI — Backrooms', en: 'MUHI — Backrooms' },
    kind: { fr: 'Spot spéculatif · Blender', ja: '自主制作CM・Blender', en: 'Spec commercial · Blender' },
    body: {
      fr: 'Un spot spéculatif pour Muhi, un traitement japonais contre les démangeaisons, qui transpose l’esthétique d’horreur des « Backrooms » — un intérieur de bureau sans fin et inquiétant — en décor de publicité. Tout est construit dans Blender, de la modélisation à l’éclairage. Le format Backrooms repose sur le malaise d’un espace sans sortie : la démangeaison est ce qui vous y enferme, Muhi est la sortie.',
      ja: 'かゆみ止め「ムヒ」の自主制作CM。インターネット発のホラー「Backrooms」――終わりのない不穏なオフィス空間――を広告の舞台に置き換えました。モデリングからライティングまですべてBlenderで制作。出口のない空間という不安を利用し、かゆみがあなたを閉じ込め、ムヒが出口になる、という構成にしています。',
      en: 'A self-directed spec commercial for Muhi, a Japanese anti-itch treatment, reimagining the “Backrooms” internet horror aesthetic — an endless, unsettling office interior — as the setting for the pitch. Built entirely in Blender, from modelling to lighting. The Backrooms format runs on unease, a space with no exit: the itch is what traps you there, Muhi is the way out.' },
    facts: {
      fr: [['Rôle', 'Concept, modélisation 3D et décors (Blender), montage son (DaVinci Resolve)'], ['Cadre', 'Projet personnel, Musashino Art University — août 2026'], ['Durée', '41 s']],
      ja: [['担当', '企画、3Dモデリング・美術（Blender）、音響編集（DaVinci Resolve）'], ['制作', '自主制作・武蔵野美術大学（2026年8月）'], ['尺', '41秒']],
      en: [['Role', 'Concept, 3D modelling & set design (Blender), sound edit (DaVinci Resolve)'], ['Context', 'Self-directed, Musashino Art University — August 2026'], ['Length', '41 s']] },
  },
];

export const SITE = { email: 'rikuuux@gmail.com', instagram: 'https://www.instagram.com/felixcardonnel/' };

export const ABOUT = {
  body: {
    fr: 'Je m’appelle Félix Daïzo Cardonnel et je signe RIKU. Franco-japonais, né et élevé à Kyoto. Formé au montage et à la postproduction (BTS Audiovisuel à Travelling, Montpellier), je suis entré en troisième année au département Imaging Arts and Sciences de l’Université d’art de Musashino, à Tokyo, en avril 2026. Je cherche aujourd’hui l’expérience du plateau, avec la direction artistique pour horizon, entre le Japon et la France.',
    ja: 'カルドネル フェリックス 大蔵（RIKU）。京都生まれ京都育ち、フランスと日本にルーツを持ちます。モンペリエの映像学校TravellingでBTS Audiovisuel（編集・ポストプロダクション）を修了し、2026年4月に武蔵野美術大学 映像学科に3年次編入しました。現在は撮影現場での経験を求めながら、日本とフランスをまたぐアートディレクターを目指しています。',
    en: 'I’m Félix Daïzo Cardonnel, and I work as RIKU. French-Japanese, born and raised in Kyoto. Trained in editing and post-production (BTS Audiovisual at Travelling, Montpellier), I transferred into the third year of the Department of Imaging Arts and Sciences at Musashino Art University, Tokyo, in April 2026. I’m now looking for on-set experience, with art direction as the goal, between Japan and France.' },
  timeline: {
    fr: [['Avr. 2026', 'Musashino Art University, Imaging Arts and Sciences — entrée en 3e année'], ['Nov. 2025', 'Art Collaboration Kyoto — cadreur, multicam en direct'], ['2023–2025', 'BTS Audiovisuel, montage et postproduction — Travelling, Montpellier'], ['Juil.–sept. 2024', 'NHK Osaka — stagiaire au service information'], ['Juil. 2023', 'Baccalauréat français — Lycée français international de Kyoto'], ['Avr. 2023', 'KYOTOGRAPHIE — assistant responsable de lieu']],
    ja: [['2026年4月', '武蔵野美術大学 映像学科 3年次編入'], ['2025年11月', 'Art Collaboration Kyoto カメラオペレーター'], ['2023〜2025年', 'BTS Audiovisuel 編集・ポストプロダクション（Travelling、モンペリエ）'], ['2024年7〜9月', 'NHK大阪放送局 報道部インターン'], ['2023年7月', 'バカロレア取得（京都フランス学院）'], ['2023年4月', 'KYOTOGRAPHIE 会場アシスタントマネージャー']],
    en: [['Apr. 2026', 'Musashino Art University, Imaging Arts and Sciences — transferred into third year'], ['Nov. 2025', 'Art Collaboration Kyoto — camera operator, live multicam'], ['2023–2025', 'BTS Audiovisual, editing & post-production — Travelling, Montpellier'], ['Jul.–Sep. 2024', 'NHK Osaka — news department intern'], ['Jul. 2023', 'French Baccalauréat — Lycée français international de Kyoto'], ['Apr. 2023', 'KYOTOGRAPHIE — assistant venue manager']] },
  facts: {
    fr: [['Montage', 'Premiere Pro, DaVinci Resolve, Avid Media Composer'], ['Compositing', 'After Effects'], ['Graphisme', 'Photoshop, Illustrator, InDesign'], ['3D', 'Blender'], ['Son', 'Ableton Live'], ['Langues', 'Japonais et français (langues maternelles), anglais courant']],
    ja: [['編集', 'Premiere Pro、DaVinci Resolve、Avid Media Composer'], ['コンポジット', 'After Effects'], ['デザイン', 'Photoshop、Illustrator、InDesign'], ['3D', 'Blender'], ['サウンド', 'Ableton Live'], ['言語', '日本語・フランス語（母語）、英語']],
    en: [['Editing', 'Premiere Pro, DaVinci Resolve, Avid Media Composer'], ['Compositing', 'After Effects'], ['Design', 'Photoshop, Illustrator, InDesign'], ['3D', 'Blender'], ['Sound', 'Ableton Live'], ['Languages', 'Japanese and French (native), English (fluent)']] },
};
