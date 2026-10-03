# Google Maps Embed (แบบฟรีตามราคาปัจจุบัน)

1. ใน Google Cloud เลือกหรือสร้าง project และตั้ง Billing ตามข้อกำหนดของ Google
2. เปิดเฉพาะ Maps Embed API ไม่ต้องเปิด Maps JavaScript, Places หรือ Routes API สำหรับฟีเจอร์นี้
3. สร้าง API Key ตั้ง Application restrictions เป็น Websites และอนุญาต https://tncride.vercel.app/* (เพิ่มโดเมนจริงอื่นถ้ามี)
4. ตั้ง API restrictions ให้ใช้ได้เฉพาะ Maps Embed API
5. Vercel > Project Settings > Environment Variables เพิ่ม GOOGLE_MAPS_EMBED_KEY สำหรับ Production แล้ว Redeploy
6. รัน supabase/upgrade-thai-locations.sql ใน Supabase SQL Editor เพื่อรองรับชื่อสถานที่ไทย แล้วทดสอบเลือกจุดและประกาศเที่ยวรถ

กุญแจ Embed ต้องปรากฏในเบราว์เซอร์ จึงจำเป็นต้องจำกัดโดเมนและ API อย่าใช้กุญแจ Supabase แทน
ไม่มี key: สมัครและจองได้เหมือนเดิม ปุ่มนำทางยังทำงาน แต่แผนที่ Google ในหน้าต่างยังไม่แสดง
ค้นหา/เลือกพิกัดใช้บริการเดิม Google Embed ใช้แสดงเส้นทางเท่านั้น การคลิกใน iframe ไม่เปลี่ยนข้อมูลเที่ยวรถ
ระยะทาง/CO2 ในระบบยังเป็นค่าประมาณเดิม ไม่ได้อ่านระยะทางขับรถกลับจาก Google

เอกสาร: https://developers.google.com/maps/documentation/embed/embedding-map
ราคา: https://developers.google.com/maps/documentation/embed/usage-and-billing
