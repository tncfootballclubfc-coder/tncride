# TNC RIDE SHARE — Supabase Edition 3.0

โค้ดชุดนี้แทนที่ Google Sheets + Apps Script ด้วย Supabase Database และ Supabase Auth ทั้งระบบ หน้าเว็บยังโฮสต์บน Vercel และใช้หน้าจอภาษาไทยเดิม

## เริ่มต้น: ต้องสร้าง Supabase Project

1. เปิด https://supabase.com/dashboard สร้างบัญชีแล้วเลือก New project
2. เลือกองค์กร ตั้งชื่อ tnc-ride ตั้งรหัสผ่านฐานข้อมูลที่ปลอดภัย เลือกภูมิภาคใกล้ผู้ใช้งาน แล้วรอสร้างเสร็จ
3. เปิด SQL Editor → New query คัดลอก `supabase/schema.sql` ทั้งไฟล์ วางแล้วกด Run **ครั้งเดียวในโปรเจกต์ใหม่**
4. Table Editor ต้องมี `tnc_profiles`, `tnc_trips`, `tnc_passengers` ทั้งหมดเปิด RLS และไม่อนุญาตเข้าตารางตรงจาก anon/authenticated การอ่านและเขียนใช้ฟังก์ชัน RPC ที่ตรวจสมาชิกและเจ้าของข้อมูล
5. หากรัน SQL ซ้ำแล้วแจ้ง relation already exists ให้หยุด ไม่ต้องลบตาราง ไฟล์นี้เป็น initial migration และครอบด้วย transaction

## ตั้งค่า Email OTP (จำเป็น)

1. Authentication → Sign In / Providers → Email เปิดใช้งาน Email และการสมัครสมาชิก
2. ตั้ง Email OTP expiration เป็น 300 วินาที และความยาว OTP เป็น 6 หลัก หากหน้าตั้งค่ามีตัวเลือกนี้
3. Authentication → Email Templates แก้ **Magic Link** และ **Confirm signup** ให้แสดงรหัส `{{ .Token }}` แทนลิงก์ ตัวอย่าง:

```html
<h2>TNC RIDE SHARE</h2>
<p>รหัสยืนยันของคุณคือ</p>
<h1>{{ .Token }}</h1>
<p>รหัสใช้ได้ 5 นาที ห้ามแจ้งให้ผู้อื่นทราบ</p>
```

4. Authentication → URL Configuration ตั้ง Site URL เป็น https://tncride.vercel.app
5. Authentication → SMTP Settings ตั้ง Custom SMTP (Host, Port, Username, Password, Sender email/name) ของบริการอีเมลที่คุณใช้

**สำคัญ:** SMTP เริ่มต้นของ Supabase มีข้อจำกัดมาก ใช้ทดสอบกับอีเมลสมาชิกทีมที่ได้รับอนุญาต และไม่เหมาะส่งให้สมาชิกทั่วไป การใช้จริงต้องมี Custom SMTP ผู้ให้บริการอาจมีโควตาฟรีหรือค่าใช้จ่าย ไม่ได้รับประกันว่าส่ง OTP ฟรีไม่จำกัด โค้ดชุดนี้ไม่ใช้ MailApp หรือโควตา Gmail จาก Apps Script แล้ว

การจำกัดส่งและตรวจรหัสใช้ Supabase Auth ไม่ใช่เพดาน 80 อีเมลและ 5 ครั้งแบบรุ่น Apps Script โดยหน้าเว็บเว้นระยะขอใหม่ 60 วินาที ตรวจ Rate Limits ใน Dashboard ให้เหมาะกับการใช้งาน การเรียก Auth ผ่าน Vercel อาจใช้โควตา IP ร่วมกัน หากเปิด CAPTCHA ต้องเพิ่ม widget/ส่ง captcha token ก่อนเปิดฟีเจอร์นั้น

เอกสาร: https://supabase.com/docs/guides/auth/auth-email-passwordless และ https://supabase.com/docs/guides/auth/auth-smtp

## ตั้งค่า Vercel

คัดลอกไฟล์ในโฟลเดอร์นี้แทนโปรเจกต์เดิม ให้ package.json และ vercel.json อยู่ราก repository โครงสร้างสำคัญ:

```
api/app.js
public/index.html
scripts/build.js
supabase/schema.sql
test/app.test.js
package.json
vercel.json
```

ลบ `api/sheets.js` เก่าออกจากโปรเจกต์ที่นำขึ้น Vercel เพื่อปิด API รุ่นเก่า เก็บสำรอง Code.gs นอก deployment ได้ ไม่ต้องใช้ไฟล์จาก google-apps-script อีก หากยังเปิด Web App รุ่นเก่าใน Apps Script ให้ปิด deployment นั้นหลังเลิกใช้งาน

Supabase → Connect หรือ Project Settings / API Keys คัดลอก Project URL และ Publishable key แล้วตั้งใน Vercel → Project → Settings → Environment Variables:

| Key | Value |
|---|---|
| SUPABASE_URL | https://รหัสโปรเจกต์.supabase.co |
| SUPABASE_PUBLISHABLE_KEY | Publishable key ที่ขึ้นต้น sb_publishable_ หรือ legacy anon key |

ใช้ **publishable / anon** เท่านั้น ไม่ต้องใช้ service_role, secret key, JWT secret หรือรหัสผ่านฐานข้อมูล ตัว key นี้ให้สิทธิ์เฉพาะตาม role และ JWT ของสมาชิก

เลือก Production และ Preview, Save แล้ว Redeploy ค่ารุ่นเก่า GOOGLE_APPS_SCRIPT_URL / GOOGLE_APPS_SCRIPT_SECRET ไม่ได้ใช้แล้ว

Framework: Other; Build Command: npm run build; Output Directory: dist; Node.js 24.x; Root Directory: โฟลเดอร์ที่มี package.json ไม่มี npm dependencies เพิ่มเติม

## ทดสอบใช้งานและดูข้อมูล

1. สมัครด้วยชื่อ เบอร์โทร 10 หลัก และอีเมลที่รับได้จริง รหัสส่งจาก Supabase ผ่าน SMTP
2. ก่อนยืนยันอาจเห็น pending user ใน Authentication → Users เป็นพฤติกรรมของ Supabase แต่ยังไม่มีสมาชิกใน tnc_profiles
3. ยืนยัน OTP → ระบบสร้าง tnc_profiles หลังอีเมลผ่านการยืนยัน แล้วตั้ง session cookie แบบ HttpOnly/Secure
4. เปิด Table Editor → tnc_profiles ตรวจชื่อ เบอร์ และอีเมล
5. เลือกผู้ขับขี่และประกาศเที่ยวรถ → ดู tnc_trips
6. ใช้อีกบัญชีร่วมรถ → ดู tnc_passengers จองซ้ำไม่เพิ่มแถวและล็อกแถวเที่ยวรถระหว่างจอง ป้องกันการแย่งที่นั่งสุดท้าย
7. เฉพาะเจ้าของรถเริ่ม/จบทริปได้ และย้อนสถานะไม่ได้
8. เบอร์โทรคนขับเปิดเฉพาะเจ้าของและผู้ร่วมรถ เบอร์ผู้โดยสารเปิดเฉพาะเจ้าตัวและคนขับ ชื่อ/เส้นทาง/ประวัติยังมองเห็นในระบบสมาชิกตามหน้าจอเดิม

Session มีอายุตาม access token สูงสุด 1 ชั่วโมง **ไม่มี auto-refresh ในรุ่นนี้** หมดอายุแล้วขอ OTP ใหม่ หน้าจอจะกลับไปล็อกอิน หากยืนยันอีเมลแล้วสร้าง profile ไม่สำเร็จเพราะเบอร์ซ้ำ ให้ผู้ดูแลตรวจข้อมูลก่อน ไม่ลบสมาชิกหรือประวัติเพื่อแก้ปัญหา

## ข้อมูลเดิม

Google Sheets ไม่ถูกแก้หรือลบ และไม่ได้ย้ายข้อมูลเข้า Supabase อัตโนมัติ สมาชิกต้องสมัคร/ยืนยันอีเมลใหม่ก่อน การย้ายประวัติเดิมต้องจัดทำ mapping ระหว่างสมาชิกเดิมกับสมาชิก Supabase และรหัสเที่ยวรถ ตรวจสำรองข้อมูลก่อนเสมอ

## ผลตรวจและขอบเขต

รัน `node --test` สำหรับ API และ syntax หน้าเว็บ; `node scripts/build.js` สร้าง dist/index.html

ทดสอบ API ด้วย Supabase จำลอง: config, validation, OTP, cookie หลังยืนยัน, JWT ใน RPC, ปฏิเสธข้อมูลตัวตนปลอม, logout และข้อผิดพลาด ไม่มี service-role key ในโค้ด ไม่มี OTP/JWT ใน localStorage

ยังไม่ได้สร้าง Project ของคุณ รัน schema ใน PostgreSQL จริง ตั้ง SMTP หรือ Deploy/ส่งอีเมลจริง ต้องทำตามขั้นตอนข้างต้นจึงจะยืนยันการใช้งานจริงได้ หน้าจอแผนที่และ CDN ภายนอกคงตามต้นฉบับ
