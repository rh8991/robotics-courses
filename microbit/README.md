# מעבדת מיקרוביט – טכנודע

אתר הקורס: דף תלמיד, דף מדריך ומאגר שיעורים. 28 מפגשים:
- **חלק א׳ (1–16):** micro:bit, מתוך [Make it: code it](https://microbit.org/projects/make-it-code-it/)
- **חלק ב׳ (17–28):** הרובוט Tiny:bit, מתוך [Yahboom Tiny-bit](https://github.com/YahboomTechnology/Tiny-bit)

## איך משנים את סדר השיעורים
עורכים את הקובץ **`data/schedule.yml`** (אפשר ישירות באתר של GitHub, עם כפתור העיפרון ✏️).

```yaml
  - num: 5
    part: microbit
    title: "מטלטלים ומגרילים"
    lessons: [dice, graphical-dice]
```
- כדי להחליף שיעור, מחליפים את המזהה ב-`lessons`. המזהים נמצאים ב-`data/lessons.yml`.
- שיעור שלא משובץ באף מפגש מופיע אוטומטית ב"מאגר שיעורים נוסף" בדף המדריך.
- אם מזהה כתוב לא נכון, תופיע באתר הודעת אזהרה כתומה.
- הרווחים בתחילת השורה חשובים – שמרו על אותה הזחה.

## איך מוסיפים שיעור חדש
מעתיקים שיעור קיים בתוך `data/lessons.yml`, משנים את ה-`id`, וממלאים את השדות (ההסבר המלא נמצא בראש הקובץ).
בתוך טקסט אפשר לכתוב `**מודגש**`, ושם בלוק בתוך `[[...]]`.

## כפתורי הקוד (MakeCode + HEX)
לכל שיעור micro:bit יש בתוך `links` רשימת `code`, שממנה נבנים הכפתורים "פתיחה ב-MakeCode" ו"הורדת קובץ HEX":
```yaml
    links:
      source: "https://microbit.org/projects/make-it-code-it/heart/"
      code:
        - makecode: "https://makecode.microbit.org/#pub:_1M2V0eiFb7jJ"
          hex: "https://downloads.microbit.org/downloads/heart-hearts-makecode.hex"
```
- את הקישורים לוקחים מכפתורי "Open in MakeCode" ו-"Download HEX" בדף השיעור המקורי ב-microbit.org.
- בשיעור עם שתי תוכניות (משדר ומקלט) מוסיפים שני פריטים, ולכל אחד `label`.
- שיעור בלי `code` מקבל כפתור "פתיחת MakeCode" כללי מתוך `makecode`.
- MakeCode תמיד נפתח בעברית: האתר מוסיף `?lang=he` לכל קישור MakeCode, אז בקובץ שומרים את הקישור כמו שהוא.

## שמות בלוקים
שמות הבלוקים בתוך `[[...]]` כתובים בעברית, בדיוק כמו שהם מופיעים ב-MakeCode בעברית (למשל `[[כאשר מתחיל]]`, `[[הצג את הסמל]]`, `[[לעולמים]]`).
- בלוקים ש-MakeCode עוד לא תרגם (למשל `play melody`, `sound level`) ובלוקים של תוסף Tiny:bit נשארים באנגלית – כי כך הם נראים על המסך.
- שמות קטגוריות: בסיס, קלט, צלילים, נורית, רדיו, לולאות, לוגיקה, משתנים, מתמטיקה, הרחבות.

## חיפוש
בדפי התלמיד והמדריך יש חיפוש לפי מילות מפתח: שם השיעור, `concepts`, שמות בלוקים (בעברית, כמו ב-MakeCode), שם המפגש והטקסט של השיעור. מספר לבד (למשל `5`) מציג את שיעורי המפגש. תלמידים מחפשים רק בשיעורים המשובצים; מדריכים מחפשים גם במאגר.

## צפייה במחשב
צריך שרת מקומי, כי פתיחה ישירה של הקובץ לא טוענת את הנתונים. למשל:
- ב-VS Code: התוסף **Live Server** ← Open with Live Server
- או, אם מותקן Python: `python -m http.server 8000` ואז http://localhost:8000

## פרסום ב-GitHub Pages
1. יוצרים ריפו חדש ב-GitHub ודוחפים אליו את התיקייה:
   ```
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
2. ב-GitHub: **Settings ← Pages ← Source: Deploy from a branch ← main / (root)**.
3. אחרי דקה-שתיים האתר זמין בכתובת `https://<user>.github.io/<repo>/`.

> שימו לב: דף המדריך (`guide.html`) לא מקושר מדף התלמידים, אבל הוא ציבורי – כל מי שיודע את הכתובת יכול להיכנס.

## מבנה
```
index.html      דף בית – בחירה בין תלמיד למדריך
student.html    28 המפגשים לתלמידים
guide.html      המפגשים + הערות מדריך + מאגר שיעורים
lesson.html     דף שיעור (lesson.html?id=heart&view=student|guide)
data/           schedule.yml (סדר) + lessons.yml (תוכן)
assets/         לוגו, עיצוב וקוד
```
