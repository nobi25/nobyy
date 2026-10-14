from pathlib import Path
import re

p=Path(__file__).resolve().parents[1]/'public'/'admin.html'
s=p.read_text()
if '/fonts/fonts.css' not in s:
    s=s.replace('<title>لوحة نوبي — الإدارة</title>', '<title>لوحة نوبي — الإدارة</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/fonts/fonts.css">')
s=s.replace('value="hiatus"','value="paused"')
s=s.replace('<b>النظام يعمل بكامل الجاهزية</b><small>آخر مزامنة منذ لحظات · الحماية نشطة · الطوابير تحت المراقبة</small>', '<b id="systemStatus">نتحقق من استجابة الخادم…</b><small>معاينة ببيانات محلية تجريبية · المعالجة الخارجية غير مفعلة</small>')
s=s.replace('<span class="health-ring">98<small>%</small></span>','<span class="health-ring">API<small id="apiStatus">…</small></span>')
s=re.sub(r'<div class="pulse-chart">.*?</div><div class="chart-legend">.*?</div>', '<div class="pulse-chart" id="pulseChart" aria-label="القراءات من السجل المحلي"></div><div class="chart-legend"><span>القراءات من السجل المحلي التجريبي</span><strong>اليوم / الأسبوع / الشهر</strong></div>',s,count=1)
s=s.replace('مؤشرات حقيقية من سجل القراءة والمحفظة، وليست أرقامًا تجميلية.','مؤشرات محسوبة من سجل القراءة والمحفظة؛ تتضمن بيانات المعاينة التجريبية.')
s=s.replace('الترجمة، التبييض، وإضافة الحقوق مع إعادة المحاولة وحالات الفشل.','سجل مهام قاعدة البيانات. عامل الملفات المرخّص منفصل وغير مفعّل في هذه المعاينة.')
p.write_text(s)
print('Admin: local fonts, paused status, honest API telemetry and preview labels applied.')
