'use strict';
const db=require('../src/db');
const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');
const artworks=[
  ['the-astral-crown','التاج النجمي','manga','/covers/story-1.webp','حين تختفي النجوم من سماء المملكة، يجد أمير شاب تاجًا يحمل ذاكرة العالم. تبدأ رحلته بين أطلال الماضي ووعدٍ لم يكتمل.'],
  ['chronicles-of-the-last-gate','سجلات البوابة الأخيرة','manhwa','/covers/story-2.webp','بوابة واحدة بقيت مفتوحة، وخلفها مدينة لا يعرفها أحد. تعبر لينا الضباب بحثًا عن أخيها، لتجد أن العودة ليست كما تخيّلت.'],
  ['moonlit-academy','أكاديمية ضوء القمر','manhwa','/covers/story-3.webp','في أكاديمية لا تظهر إلا عند اكتمال القمر، تكتشف طالبة جديدة كتابًا يكتب الغد. لكن كل صفحة تقرؤها تغيّر شيئًا في قلبها.'],
  ['iron-oath-protocol','عهد الحديد','webtoon','/covers/story-4.webp','فارس فقد رايته ولم يفقد وعده. في مملكة أحرقتها الحروب، يتعلّم أن أقوى الدروع ليست دائمًا من الحديد.'],
  ['the-silent-alchemist','الخيميائي الصامت','novel','/covers/story-5.webp','بين رفوف مكتبة قديمة، يصنع خيميائي وحيد علاجًا للنسيان. وحين تصل إليه رسالة بلا كلمات، تعود أسرار كان يظنها انتهت.']
];
const paragraphs=[
'في تلك الليلة، لم تكن المدينة نائمة كما تبدو. خلف النوافذ الضيقة ظلّت مصابيح صغيرة تضيء الطريق لمن ينتظر، وفي آخر الشارع وقفت شجرة قديمة تحفظ من الحكايات أكثر مما تحفظ الكتب. لم يعرف أحد متى بدأت الأصوات تتسلل من بين أوراقها، لكن الجميع عرف أن شيئًا على وشك التغيّر.',
'توقفت الخطوات عند الباب. كانت علامة صغيرة محفورة في الخشب، علامة عرفها من رسم قديم بقي في ذاكرته منذ الطفولة. مدّ يده ببطء، ولمس الخط الرفيع الذي يفصل الحاضر عمّا ظن أنه نُسي. من الداخل جاء صوت هادئ: «كنت أعرف أنك ستصل، لكن ليس بهذه السرعة».',
'داخل الغرفة، لم يكن هناك سوى طاولة مستديرة وكتاب مفتوح. تحرّكت الصفحات مع أن النوافذ كانت مغلقة، وعلى الصفحة الأخيرة سطر لم يجف حبره بعد. قرأ الكلمات مرة ثم مرة ثانية. لم تكن رسالة إلى شخص غريب؛ كانت تصف اللحظة التي يعيشها الآن، بكل تفاصيلها الصغيرة.',
'جلس قبالة الضوء وسأل نفسه إن كانت هذه بداية الطريق أم نهايته. في الخارج مرّت ريح خفيفة، وحملت معها رائحة المطر. ثم سمع وقع خطوة أخرى عند العتبة. هذه المرة لم يكن وحده. رأى ابتسامة مطمئنة، ويدًا تحمل خريطة لا تشبه خرائط المدينة التي يعرفها.',
'«لا نبحث عن إجابة واحدة»، قالت وهي تفرد الخريطة. «نبحث عن السؤال الذي لم يجرؤ أحد على طرحه». فوق الورق امتدت طرق رفيعة بين جبال مرسومة بحبر أزرق. عند الحافة علامة تشبه تلك الموجودة على الباب، وتحتها اسم لم يُكتب كاملًا.',
'عند الفجر انطلقا. كان الطريق في البداية مألوفًا، ثم أخذ يتغيّر شيئًا فشيئًا. البيوت صارت أبعد، والهواء أخف، والأصوات أكثر وضوحًا. كل ما كان يعرفه عن المدينة بدا صغيرًا حين ظهرت خلف التل بوابة لم يرها أحد من قبل. توقف لحظة، ثم واصل السير. الحكاية لم تنتهِ؛ لقد بدأت للتو.'
];
db.transaction(()=>{
  for(const [slug,title,kind,cover,synopsis] of artworks){
    const w=db.prepare('SELECT id FROM works WHERE slug=?').get(slug);if(!w)continue;
    db.prepare('UPDATE works SET title=?,kind=?,cover_url=?,synopsis=?,author=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(title,kind,cover,synopsis,'نوبي — قصة تجريبية',w.id);
    db.prepare('UPDATE chapters SET pages_json=?,text_ar=?,title=?,created_at=CURRENT_TIMESTAMP WHERE work_id=?').run('[]',paragraphs.join('\n\n'),'حين تفتح الحكاية بابها',w.id);
  }
  // Demo-reader accounts have no reusable public password.
  const key='preview_curated_v1';
  if(!db.prepare('SELECT 1 FROM site_settings WHERE key=?').get(key)){
    db.prepare("UPDATE users SET password_hash=? WHERE email LIKE 'reader%@seed.noby'").run(bcrypt.hashSync(crypto.randomBytes(32).toString('hex'),10));
    db.prepare('INSERT INTO site_settings(key,value_json) VALUES(?,?)').run(key,'true');
  }
})()
console.log('Applied five original preview covers and Arabic sample stories.');
