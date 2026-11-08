'use strict';
// LOCKED plain-language templates for the 30 most common tests, in English,
// Telugu and Hindi. These are fixed, reviewed text: no AI is involved when a
// test is listed here. They never contain numbers (the report row shows the
// value and range) and never name a diagnosis as certain.
//
// NOTE: wording is a first draft for pathologist and native-speaker sign-off
// before go-live (see docs/TDD.md, "Limits").

const L = ['en', 'te', 'hi'];

// Shared sentence for "outside range but usually not a concern on its own".
const FINE_LOW = {
  en: 'A value below the usual range is often not a concern on its own. Please show this report to your doctor.',
  te: 'సాధారణ పరిధి కంటే తక్కువగా ఉండటం చాలాసార్లు ఒక్కటిగా ఆందోళన కలిగించదు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
  hi: 'सामान्य सीमा से कम मान अकेले अक्सर चिंता की बात नहीं होता। कृपया यह रिपोर्ट अपने डॉक्टर को दिखाएँ।',
};
const FINE_HIGH = {
  en: 'A value above the usual range is often not a concern on its own. Please show this report to your doctor.',
  te: 'సాధారణ పరిధి కంటే ఎక్కువగా ఉండటం చాలాసార్లు ఒక్కటిగా ఆందోళన కలిగించదు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
  hi: 'सामान्य सीमा से अधिक मान अकेले अक्सर चिंता की बात नहीं होता। कृपया यह रिपोर्ट अपने डॉक्टर को दिखाएँ।',
};

const TESTS = [
  {
    key: 'haemoglobin', aliases: ['haemoglobin', 'hemoglobin', 'hb'],
    name: { en: 'Haemoglobin', te: 'హిమోగ్లోబిన్', hi: 'हीमोग्लोबिन' },
    low: {
      en: 'Haemoglobin carries oxygen in your blood. A low value can be a sign of anaemia and may cause tiredness or weakness. Your doctor can find the reason.',
      te: 'హిమోగ్లోబిన్ మీ రక్తంలో ఆక్సిజన్‌ను తీసుకెళ్తుంది. ఇది తక్కువగా ఉంటే రక్తహీనత (అనీమియా) కావచ్చు; అలసట, నీరసం ఉండవచ్చు. కారణాన్ని మీ డాక్టర్ తెలుసుకోగలరు.',
      hi: 'हीमोग्लोबिन आपके खून में ऑक्सीजन पहुँचाता है। इसका कम होना खून की कमी (एनीमिया) का संकेत हो सकता है, जिससे थकान या कमज़ोरी लग सकती है। कारण डॉक्टर बता सकते हैं।',
    },
    high: {
      en: 'A higher haemoglobin can happen when the body is short of water, with smoking, or at high altitude. Please discuss it with your doctor.',
      te: 'శరీరంలో నీరు తగ్గినప్పుడు, ధూమపానం ఉన్నప్పుడు హిమోగ్లోబిన్ ఎక్కువగా ఉండవచ్చు. దయచేసి మీ డాక్టర్‌తో మాట్లాడండి.',
      hi: 'शरीर में पानी की कमी या धूम्रपान से हीमोग्लोबिन अधिक हो सकता है। कृपया अपने डॉक्टर से बात करें।',
    },
  },
  {
    key: 'wbc', aliases: ['total wbc count', 'wbc count', 'wbc', 'total leucocyte count', 'total leukocyte count', 'tlc'],
    name: { en: 'White blood cells', te: 'తెల్ల రక్త కణాలు', hi: 'श्वेत रक्त कोशिकाएँ' },
    low: {
      en: 'White blood cells help fight infection. A low count can follow some viral infections or medicines. Please ask your doctor whether it needs a repeat test.',
      te: 'తెల్ల రక్త కణాలు ఇన్ఫెక్షన్‌తో పోరాడుతాయి. కొన్ని వైరల్ ఇన్ఫెక్షన్లు లేదా మందుల తర్వాత ఇవి తగ్గవచ్చు. మళ్ళీ పరీక్ష అవసరమా అని డాక్టర్‌ను అడగండి.',
      hi: 'श्वेत रक्त कोशिकाएँ संक्रमण से लड़ती हैं। कुछ वायरल संक्रमण या दवाओं के बाद इनकी संख्या कम हो सकती है। दोबारा जाँच की ज़रूरत है या नहीं, डॉक्टर से पूछें।',
    },
    high: {
      en: 'White blood cells help fight infection. A high count is often seen when the body is fighting an infection. Please show this report to your doctor.',
      te: 'తెల్ల రక్త కణాలు ఇన్ఫెక్షన్‌తో పోరాడుతాయి. శరీరం ఇన్ఫెక్షన్‌తో పోరాడుతున్నప్పుడు ఇవి ఎక్కువగా ఉండవచ్చు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'श्वेत रक्त कोशिकाएँ संक्रमण से लड़ती हैं। शरीर जब संक्रमण से लड़ रहा हो तो इनकी संख्या अक्सर बढ़ जाती है। कृपया रिपोर्ट अपने डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'platelets', aliases: ['platelet count', 'platelets', 'plt'],
    name: { en: 'Platelets', te: 'ప్లేట్‌లెట్లు', hi: 'प्लेटलेट्स' },
    low: {
      en: 'Platelets help the blood to clot. A low count can make bleeding or bruising easier. Please see your doctor soon to find the reason.',
      te: 'ప్లేట్‌లెట్లు రక్తం గడ్డకట్టడానికి సహాయపడతాయి. ఇవి తక్కువగా ఉంటే రక్తస్రావం లేదా కమిలిపోవడం సులభంగా జరగవచ్చు. కారణం తెలుసుకోవడానికి త్వరగా డాక్టర్‌ను కలవండి.',
      hi: 'प्लेटलेट्स खून जमने में मदद करते हैं। इनकी कमी से खून बहना या नील पड़ना आसान हो सकता है। कारण जानने के लिए जल्दी डॉक्टर से मिलें।',
    },
    high: {
      en: 'Platelets help the blood to clot. A high count can follow infection, inflammation or low iron. Please show this report to your doctor.',
      te: 'ప్లేట్‌లెట్లు రక్తం గడ్డకట్టడానికి సహాయపడతాయి. ఇన్ఫెక్షన్, వాపు లేదా ఐరన్ తక్కువగా ఉన్నప్పుడు ఇవి పెరగవచ్చు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'प्लेटलेट्स खून जमने में मदद करते हैं। संक्रमण, सूजन या आयरन की कमी के बाद ये बढ़ सकते हैं। कृपया रिपोर्ट अपने डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'rbc', aliases: ['rbc count', 'rbc', 'red blood cell count'],
    name: { en: 'Red blood cells', te: 'ఎర్ర రక్త కణాలు', hi: 'लाल रक्त कोशिकाएँ' },
    low: {
      en: 'Red blood cells carry oxygen. A low count often goes with anaemia and can cause tiredness. Your doctor can find the reason.',
      te: 'ఎర్ర రక్త కణాలు ఆక్సిజన్‌ను తీసుకెళ్తాయి. ఇవి తక్కువగా ఉంటే తరచుగా రక్తహీనత ఉంటుంది; అలసట కలగవచ్చు. కారణాన్ని మీ డాక్టర్ తెలుసుకోగలరు.',
      hi: 'लाल रक्त कोशिकाएँ ऑक्सीजन ले जाती हैं। इनकी कमी अक्सर खून की कमी के साथ होती है और थकान दे सकती है। कारण डॉक्टर बता सकते हैं।',
    },
    high: {
      en: 'A higher red cell count can happen with dehydration, smoking or high altitude. Please discuss it with your doctor.',
      te: 'శరీరంలో నీరు తగ్గడం, ధూమపానం వల్ల ఎర్ర రక్త కణాలు ఎక్కువగా ఉండవచ్చు. దయచేసి మీ డాక్టర్‌తో మాట్లాడండి.',
      hi: 'पानी की कमी या धूम्रपान से लाल रक्त कोशिकाएँ अधिक हो सकती हैं। कृपया अपने डॉक्टर से बात करें।',
    },
  },
  {
    key: 'pcv', aliases: ['pcv', 'hematocrit', 'haematocrit', 'packed cell volume'],
    name: { en: 'Packed cell volume', te: 'ప్యాక్డ్ సెల్ వాల్యూమ్', hi: 'पैक्ड सेल वॉल्यूम' },
    low: {
      en: 'This shows how much of your blood is red cells. A low value often goes with anaemia. Please show this report to your doctor.',
      te: 'మీ రక్తంలో ఎర్ర కణాల పరిమాణం ఎంతో ఇది చూపిస్తుంది. తక్కువగా ఉంటే తరచుగా రక్తహీనత ఉంటుంది. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'यह दिखाता है कि आपके खून में लाल कोशिकाएँ कितनी हैं। कम होने पर अक्सर खून की कमी होती है। कृपया रिपोर्ट अपने डॉक्टर को दिखाएँ।',
    },
    high: {
      en: 'A high value can happen when the body is short of water. Please drink enough fluids and show this report to your doctor.',
      te: 'శరీరంలో నీరు తగ్గినప్పుడు ఇది ఎక్కువగా ఉండవచ్చు. తగినంత నీరు తాగి, ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'शरीर में पानी की कमी होने पर यह अधिक आ सकता है। पर्याप्त पानी पिएँ और रिपोर्ट अपने डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'mcv', aliases: ['mcv'],
    name: { en: 'Red cell size (MCV)', te: 'ఎర్ర కణాల పరిమాణం (MCV)', hi: 'लाल कोशिका का आकार (MCV)' },
    low: {
      en: 'Your red blood cells are smaller than usual. This is common with low iron. Your doctor may advise a few more tests.',
      te: 'మీ ఎర్ర రక్త కణాలు సాధారణం కంటే చిన్నగా ఉన్నాయి. ఐరన్ తక్కువగా ఉన్నప్పుడు ఇది సాధారణం. డాక్టర్ మరికొన్ని పరీక్షలు సూచించవచ్చు.',
      hi: 'आपकी लाल रक्त कोशिकाएँ सामान्य से छोटी हैं। आयरन की कमी में यह आम है। डॉक्टर कुछ और जाँच सुझा सकते हैं।',
    },
    high: {
      en: 'Your red blood cells are larger than usual. This can be linked to low vitamin B12 or folate. Please show this report to your doctor.',
      te: 'మీ ఎర్ర రక్త కణాలు సాధారణం కంటే పెద్దగా ఉన్నాయి. విటమిన్ B12 లేదా ఫోలేట్ తక్కువగా ఉండటంతో ఇది ముడిపడి ఉండవచ్చు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'आपकी लाल रक्त कोशिकाएँ सामान्य से बड़ी हैं। यह विटामिन B12 या फोलेट की कमी से जुड़ा हो सकता है। कृपया रिपोर्ट अपने डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'fbs', aliases: ['fasting blood glucose', 'fasting blood sugar', 'fbs', 'glucose fasting', 'fasting glucose'],
    name: { en: 'Fasting blood sugar', te: 'ఖాళీ కడుపుతో రక్తంలో చక్కెర', hi: 'खाली पेट ब्लड शुगर' },
    low: {
      en: 'Blood sugar is lower than usual. If you feel dizzy, sweaty or shaky, eat something sweet and contact your doctor.',
      te: 'రక్తంలో చక్కెర సాధారణం కంటే తక్కువగా ఉంది. తల తిరగడం, చెమటలు, వణుకు ఉంటే ఏదైనా తీపి తిని మీ డాక్టర్‌ను సంప్రదించండి.',
      hi: 'ब्लड शुगर सामान्य से कम है। चक्कर, पसीना या कंपकंपी हो तो कुछ मीठा खाएँ और डॉक्टर से संपर्क करें।',
    },
    high: {
      en: 'Your blood sugar before food is higher than usual. This can be an early sign of high sugar (diabetes). Please see your doctor to confirm.',
      te: 'భోజనానికి ముందు మీ రక్తంలో చక్కెర సాధారణం కంటే ఎక్కువగా ఉంది. ఇది షుగర్ (డయాబెటిస్) మొదటి సూచన కావచ్చు. నిర్ధారణ కోసం మీ డాక్టర్‌ను కలవండి.',
      hi: 'खाने से पहले आपका ब्लड शुगर सामान्य से अधिक है। यह शुगर (डायबिटीज़) का शुरुआती संकेत हो सकता है। पुष्टि के लिए डॉक्टर से मिलें।',
    },
  },
  {
    key: 'ppbs', aliases: ['post prandial glucose', 'postprandial blood sugar', 'post prandial blood sugar', 'ppbs', 'glucose pp'],
    name: { en: 'Blood sugar after food', te: 'భోజనం తర్వాత రక్తంలో చక్కెర', hi: 'खाने के बाद ब्लड शुगर' },
    low: {
      en: 'Blood sugar after food is lower than usual. Please show this report to your doctor, especially if you feel dizzy or shaky.',
      te: 'భోజనం తర్వాత రక్తంలో చక్కెర సాధారణం కంటే తక్కువగా ఉంది. తల తిరగడం, వణుకు ఉంటే ముఖ్యంగా ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'खाने के बाद ब्लड शुगर सामान्य से कम है। खासकर चक्कर या कंपकंपी हो तो रिपोर्ट डॉक्टर को दिखाएँ।',
    },
    high: {
      en: 'Your blood sugar after food is higher than usual. This can be a sign of high sugar (diabetes). Please see your doctor to confirm.',
      te: 'భోజనం తర్వాత మీ రక్తంలో చక్కెర సాధారణం కంటే ఎక్కువగా ఉంది. ఇది షుగర్ (డయాబెటిస్) సూచన కావచ్చు. నిర్ధారణ కోసం మీ డాక్టర్‌ను కలవండి.',
      hi: 'खाने के बाद आपका ब्लड शुगर सामान्य से अधिक है। यह शुगर (डायबिटीज़) का संकेत हो सकता है। पुष्टि के लिए डॉक्टर से मिलें।',
    },
  },
  {
    key: 'hba1c', aliases: ['hba1c', 'glycosylated haemoglobin', 'glycated haemoglobin'],
    name: { en: 'HbA1c (3-month sugar)', te: 'HbA1c (3 నెలల చక్కెర స్థాయి)', hi: 'HbA1c (3 महीने का शुगर)' },
    low: FINE_LOW,
    high: {
      en: 'HbA1c shows your average blood sugar over about three months. A high value means sugar has been above target. Please see your doctor about it.',
      te: 'HbA1c గత మూడు నెలల సగటు రక్త చక్కెరను చూపిస్తుంది. ఎక్కువగా ఉంటే చక్కెర లక్ష్యం కంటే ఎక్కువగా ఉందని అర్థం. దయచేసి మీ డాక్టర్‌ను కలవండి.',
      hi: 'HbA1c लगभग तीन महीने का औसत ब्लड शुगर दिखाता है। अधिक होने का मतलब है कि शुगर लक्ष्य से ऊपर रहा है। कृपया डॉक्टर से मिलें।',
    },
  },
  {
    key: 'cholesterol', aliases: ['total cholesterol', 'cholesterol', 'cholesterol total', 'serum cholesterol'],
    name: { en: 'Total cholesterol', te: 'మొత్తం కొలెస్ట్రాల్', hi: 'कुल कोलेस्ट्रॉल' },
    low: FINE_LOW,
    high: {
      en: 'Cholesterol is a type of fat in the blood. A high value can raise the risk of heart problems over time. Your doctor can advise on food and exercise.',
      te: 'కొలెస్ట్రాల్ రక్తంలోని ఒక రకమైన కొవ్వు. ఎక్కువగా ఉంటే కాలక్రమేణా గుండె సమస్యల ప్రమాదం పెరగవచ్చు. ఆహారం, వ్యాయామం గురించి డాక్టర్ సలహా ఇస్తారు.',
      hi: 'कोलेस्ट्रॉल खून में मौजूद एक प्रकार की चर्बी है। अधिक होने पर समय के साथ हृदय की समस्याओं का खतरा बढ़ सकता है। खान-पान और व्यायाम पर डॉक्टर सलाह देंगे।',
    },
  },
  {
    key: 'ldl', aliases: ['ldl cholesterol', 'ldl', 'ldl c'],
    name: { en: 'LDL ("bad") cholesterol', te: 'LDL ("చెడు") కొలెస్ట్రాల్', hi: 'LDL ("खराब") कोलेस्ट्रॉल' },
    low: FINE_LOW,
    high: {
      en: 'LDL is the "bad" cholesterol that can build up in blood vessels. A high value can raise the risk of heart problems. Your doctor can advise on food, exercise and treatment.',
      te: 'LDL అనేది రక్తనాళాల్లో పేరుకునే "చెడు" కొలెస్ట్రాల్. ఎక్కువగా ఉంటే గుండె సమస్యల ప్రమాదం పెరగవచ్చు. ఆహారం, వ్యాయామం, చికిత్స గురించి డాక్టర్ సలహా ఇస్తారు.',
      hi: 'LDL "खराब" कोलेस्ट्रॉल है जो नसों में जम सकता है। अधिक होने पर हृदय की समस्याओं का खतरा बढ़ सकता है। खान-पान, व्यायाम और इलाज पर डॉक्टर सलाह देंगे।',
    },
  },
  {
    key: 'hdl', aliases: ['hdl cholesterol', 'hdl', 'hdl c'],
    name: { en: 'HDL ("good") cholesterol', te: 'HDL ("మంచి") కొలెస్ట్రాల్', hi: 'HDL ("अच्छा") कोलेस्ट्रॉल' },
    low: {
      en: 'HDL is the "good" cholesterol that protects the heart. A low value means less protection. Regular exercise and a healthy diet can help; please ask your doctor.',
      te: 'HDL అనేది గుండెను కాపాడే "మంచి" కొలెస్ట్రాల్. తక్కువగా ఉంటే రక్షణ తగ్గుతుంది. క్రమం తప్పని వ్యాయామం, ఆరోగ్యకరమైన ఆహారం సహాయపడతాయి; డాక్టర్‌ను అడగండి.',
      hi: 'HDL "अच्छा" कोलेस्ट्रॉल है जो हृदय की रक्षा करता है। कम होने पर सुरक्षा कम होती है। नियमित व्यायाम और स्वस्थ आहार मदद करते हैं; कृपया डॉक्टर से पूछें।',
    },
    high: FINE_HIGH,
  },
  {
    key: 'triglycerides', aliases: ['triglycerides', 'triglyceride', 'tg'],
    name: { en: 'Triglycerides', te: 'ట్రైగ్లిసరైడ్స్', hi: 'ट्राइग्लिसराइड्स' },
    low: FINE_LOW,
    high: {
      en: 'Triglycerides are a type of fat in the blood. A high value is often linked to sweets, fried food, alcohol or low activity. Your doctor can advise you.',
      te: 'ట్రైగ్లిసరైడ్స్ రక్తంలోని ఒక రకమైన కొవ్వు. తీపి, వేపుళ్ళు, మద్యం, శారీరక శ్రమ తక్కువగా ఉండటంతో ఇవి తరచుగా పెరుగుతాయి. డాక్టర్ సలహా ఇస్తారు.',
      hi: 'ट्राइग्लिसराइड्स खून में मौजूद एक प्रकार की चर्बी है। मिठाई, तला खाना, शराब या कम गतिविधि से यह अक्सर बढ़ती है। डॉक्टर सलाह देंगे।',
    },
  },
  {
    key: 'creatinine', aliases: ['creatinine', 'serum creatinine'],
    name: { en: 'Creatinine (kidney test)', te: 'క్రియాటినిన్ (కిడ్నీ పరీక్ష)', hi: 'क्रिएटिनिन (किडनी जाँच)' },
    low: FINE_LOW,
    high: {
      en: 'Creatinine shows how well the kidneys clean the blood. A high value can mean the kidneys are working less well. Please see your doctor soon.',
      te: 'క్రియాటినిన్ కిడ్నీలు రక్తాన్ని ఎంత బాగా శుభ్రం చేస్తున్నాయో చూపిస్తుంది. ఎక్కువగా ఉంటే కిడ్నీల పనితీరు తగ్గి ఉండవచ్చు. దయచేసి త్వరగా మీ డాక్టర్‌ను కలవండి.',
      hi: 'क्रिएटिनिन दिखाता है कि किडनी खून को कितनी अच्छी तरह साफ़ कर रही हैं। अधिक होने का मतलब किडनी कम काम कर रही हो सकती हैं। कृपया जल्दी डॉक्टर से मिलें।',
    },
  },
  {
    key: 'urea', aliases: ['blood urea', 'urea', 'serum urea'],
    name: { en: 'Blood urea (kidney test)', te: 'బ్లడ్ యూరియా (కిడ్నీ పరీక్ష)', hi: 'ब्लड यूरिया (किडनी जाँच)' },
    low: FINE_LOW,
    high: {
      en: 'Urea is a waste product the kidneys remove. A high value can be due to dehydration or reduced kidney function. Please show this report to your doctor.',
      te: 'యూరియా కిడ్నీలు తొలగించే వ్యర్థ పదార్థం. ఎక్కువగా ఉంటే నీరు తగ్గడం లేదా కిడ్నీ పనితీరు తగ్గడం కారణం కావచ్చు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'यूरिया एक अपशिष्ट पदार्थ है जिसे किडनी बाहर निकालती हैं। अधिक होने का कारण पानी की कमी या किडनी का कम काम करना हो सकता है। कृपया रिपोर्ट डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'uric_acid', aliases: ['uric acid', 'serum uric acid'],
    name: { en: 'Uric acid', te: 'యూరిక్ యాసిడ్', hi: 'यूरिक एसिड' },
    low: FINE_LOW,
    high: {
      en: 'A high uric acid can cause joint pain (gout) or kidney stones in some people. Drinking enough water helps. Please discuss it with your doctor.',
      te: 'యూరిక్ యాసిడ్ ఎక్కువగా ఉంటే కొందరిలో కీళ్ల నొప్పి (గౌట్) లేదా కిడ్నీలో రాళ్లు రావచ్చు. తగినంత నీరు తాగడం సహాయపడుతుంది. దయచేసి మీ డాక్టర్‌తో మాట్లాడండి.',
      hi: 'यूरिक एसिड अधिक होने पर कुछ लोगों में जोड़ों का दर्द (गाउट) या किडनी की पथरी हो सकती है। पर्याप्त पानी पीना मदद करता है। कृपया डॉक्टर से बात करें।',
    },
  },
  {
    key: 'sodium', aliases: ['sodium', 'serum sodium'],
    name: { en: 'Sodium', te: 'సోడియం', hi: 'सोडियम' },
    low: {
      en: 'Sodium is a salt that balances water in the body. A low value can cause tiredness, headache or confusion. Please see your doctor soon.',
      te: 'సోడియం శరీరంలో నీటి సమతుల్యతను కాపాడే ఉప్పు. తక్కువగా ఉంటే అలసట, తలనొప్పి లేదా గందరగోళం కలగవచ్చు. దయచేసి త్వరగా మీ డాక్టర్‌ను కలవండి.',
      hi: 'सोडियम एक नमक है जो शरीर में पानी का संतुलन रखता है। कम होने पर थकान, सिरदर्द या भ्रम हो सकता है। कृपया जल्दी डॉक्टर से मिलें।',
    },
    high: {
      en: 'A high sodium is often due to the body being short of water. Please drink enough fluids and show this report to your doctor.',
      te: 'శరీరంలో నీరు తగ్గడం వల్ల సోడియం తరచుగా ఎక్కువగా ఉంటుంది. తగినంత నీరు తాగి, ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'सोडियम अधिक होना अक्सर शरीर में पानी की कमी से होता है। पर्याप्त पानी पिएँ और रिपोर्ट डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'potassium', aliases: ['potassium', 'serum potassium'],
    name: { en: 'Potassium', te: 'పొటాషియం', hi: 'पोटैशियम' },
    low: {
      en: 'Potassium helps muscles and the heart work properly. A low value can cause weakness or cramps. Please see your doctor soon.',
      te: 'పొటాషియం కండరాలు, గుండె సరిగా పనిచేయడానికి సహాయపడుతుంది. తక్కువగా ఉంటే నీరసం, కండరాల తిమ్మిర్లు కలగవచ్చు. దయచేసి త్వరగా మీ డాక్టర్‌ను కలవండి.',
      hi: 'पोटैशियम मांसपेशियों और हृदय को ठीक से काम करने में मदद करता है। कम होने पर कमज़ोरी या ऐंठन हो सकती है। कृपया जल्दी डॉक्टर से मिलें।',
    },
    high: {
      en: 'Potassium helps muscles and the heart work properly. A high value needs your doctor\'s attention soon. Please contact your doctor.',
      te: 'పొటాషియం కండరాలు, గుండె సరిగా పనిచేయడానికి సహాయపడుతుంది. ఎక్కువగా ఉంటే డాక్టర్ త్వరగా దృష్టి పెట్టాలి. దయచేసి మీ డాక్టర్‌ను సంప్రదించండి.',
      hi: 'पोटैशियम मांसपेशियों और हृदय को ठीक से काम करने में मदद करता है। अधिक होने पर डॉक्टर को जल्दी ध्यान देना चाहिए। कृपया डॉक्टर से संपर्क करें।',
    },
  },
  {
    key: 'calcium', aliases: ['calcium', 'serum calcium', 'total calcium'],
    name: { en: 'Calcium', te: 'కాల్షియం', hi: 'कैल्शियम' },
    low: {
      en: 'Calcium keeps bones and muscles healthy. A low value can be linked to low vitamin D or diet and can cause cramps. Please show this report to your doctor.',
      te: 'కాల్షియం ఎముకలు, కండరాలను ఆరోగ్యంగా ఉంచుతుంది. తక్కువగా ఉంటే విటమిన్ D లేదా ఆహారంతో సంబంధం ఉండవచ్చు; కండరాల తిమ్మిర్లు కలగవచ్చు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'कैल्शियम हड्डियों और मांसपेशियों को स्वस्थ रखता है। कम होना विटामिन D या आहार से जुड़ा हो सकता है और ऐंठन दे सकता है। कृपया रिपोर्ट डॉक्टर को दिखाएँ।',
    },
    high: {
      en: 'A high calcium value should be checked by a doctor to find the reason. Please show this report to your doctor.',
      te: 'కాల్షియం ఎక్కువగా ఉంటే కారణం తెలుసుకోవడానికి డాక్టర్ పరీక్షించాలి. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'कैल्शियम अधिक होने पर कारण जानने के लिए डॉक्टर से जाँच करानी चाहिए। कृपया रिपोर्ट डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'sgot', aliases: ['sgot ast', 'sgot', 'ast', 'aspartate aminotransferase'],
    name: { en: 'SGOT / AST (liver test)', te: 'SGOT / AST (లివర్ పరీక్ష)', hi: 'SGOT / AST (लिवर जाँच)' },
    low: FINE_LOW,
    high: {
      en: 'SGOT is an enzyme found in the liver and muscles. A high value can mean the liver or muscles are stressed. Avoid alcohol and show this report to your doctor.',
      te: 'SGOT కాలేయం, కండరాల్లో ఉండే ఎంజైమ్. ఎక్కువగా ఉంటే కాలేయం లేదా కండరాలపై ఒత్తిడి ఉండవచ్చు. మద్యం మానండి, ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'SGOT लिवर और मांसपेशियों में पाया जाने वाला एंज़ाइम है। अधिक होने पर लिवर या मांसपेशियों पर दबाव हो सकता है। शराब से बचें और रिपोर्ट डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'sgpt', aliases: ['sgpt alt', 'sgpt', 'alt', 'alanine aminotransferase'],
    name: { en: 'SGPT / ALT (liver test)', te: 'SGPT / ALT (లివర్ పరీక్ష)', hi: 'SGPT / ALT (लिवर जाँच)' },
    low: FINE_LOW,
    high: {
      en: 'SGPT is an enzyme found mainly in the liver. A high value can mean the liver is irritated, for example by fat, alcohol, infection or some medicines. Please show this report to your doctor.',
      te: 'SGPT ప్రధానంగా కాలేయంలో ఉండే ఎంజైమ్. ఎక్కువగా ఉంటే కొవ్వు, మద్యం, ఇన్ఫెక్షన్ లేదా కొన్ని మందుల వల్ల కాలేయం ప్రభావితమై ఉండవచ్చు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'SGPT मुख्य रूप से लिवर में पाया जाने वाला एंज़ाइम है। अधिक होने पर चर्बी, शराब, संक्रमण या कुछ दवाओं से लिवर प्रभावित हो सकता है। कृपया रिपोर्ट डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'alp', aliases: ['alkaline phosphatase', 'alp'],
    name: { en: 'Alkaline phosphatase', te: 'ఆల్కలైన్ ఫాస్ఫటేస్', hi: 'एल्कलाइन फॉस्फेटेज़' },
    low: FINE_LOW,
    high: {
      en: 'This enzyme comes from the liver and bones. A high value can relate to either. Please show this report to your doctor.',
      te: 'ఈ ఎంజైమ్ కాలేయం, ఎముకల నుంచి వస్తుంది. ఎక్కువగా ఉంటే వీటిలో దేనికైనా సంబంధం ఉండవచ్చు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'यह एंज़ाइम लिवर और हड्डियों से आता है। अधिक होना इनमें से किसी से जुड़ा हो सकता है। कृपया रिपोर्ट डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'bilirubin', aliases: ['total bilirubin', 'bilirubin total', 'bilirubin', 'serum bilirubin'],
    name: { en: 'Bilirubin (liver test)', te: 'బిలిరుబిన్ (లివర్ పరీక్ష)', hi: 'बिलीरुबिन (लिवर जाँच)' },
    low: FINE_LOW,
    high: {
      en: 'A high bilirubin can turn the skin and eyes yellow (jaundice) and may point to a liver or blood problem. Please see your doctor soon.',
      te: 'బిలిరుబిన్ ఎక్కువగా ఉంటే చర్మం, కళ్ళు పసుపు రంగులోకి (కామెర్లు) మారవచ్చు; కాలేయం లేదా రక్త సమస్య ఉండవచ్చు. దయచేసి త్వరగా మీ డాక్టర్‌ను కలవండి.',
      hi: 'बिलीरुबिन अधिक होने पर त्वचा और आँखें पीली (पीलिया) हो सकती हैं और लिवर या खून की समस्या हो सकती है। कृपया जल्दी डॉक्टर से मिलें।',
    },
  },
  {
    key: 'tsh', aliases: ['tsh', 'thyroid stimulating hormone'],
    name: { en: 'TSH (thyroid test)', te: 'TSH (థైరాయిడ్ పరీక్ష)', hi: 'TSH (थायरॉइड जाँच)' },
    low: {
      en: 'A low TSH can mean the thyroid gland is too active. This can cause a fast heartbeat, weight loss or sweating. Please see your doctor.',
      te: 'TSH తక్కువగా ఉంటే థైరాయిడ్ గ్రంథి ఎక్కువగా పనిచేస్తుండవచ్చు. దీనివల్ల గుండె వేగంగా కొట్టుకోవడం, బరువు తగ్గడం, చెమటలు కలగవచ్చు. దయచేసి మీ డాక్టర్‌ను కలవండి.',
      hi: 'TSH कम होने का मतलब थायरॉइड ग्रंथि ज़्यादा सक्रिय हो सकती है। इससे दिल की तेज़ धड़कन, वज़न घटना या पसीना आ सकता है। कृपया डॉक्टर से मिलें।',
    },
    high: {
      en: 'A high TSH can mean the thyroid gland is underactive. This can cause tiredness, weight gain or feeling cold. Please see your doctor.',
      te: 'TSH ఎక్కువగా ఉంటే థైరాయిడ్ గ్రంథి తక్కువగా పనిచేస్తుండవచ్చు. దీనివల్ల అలసట, బరువు పెరగడం, చలిగా అనిపించడం కలగవచ్చు. దయచేసి మీ డాక్టర్‌ను కలవండి.',
      hi: 'TSH अधिक होने का मतलब थायरॉइड ग्रंथि कम सक्रिय हो सकती है। इससे थकान, वज़न बढ़ना या ठंड लगना हो सकता है। कृपया डॉक्टर से मिलें।',
    },
  },
  {
    key: 't4', aliases: ['free t4', 'ft4', 't4', 'thyroxine'],
    name: { en: 'Thyroid hormone (T4)', te: 'థైరాయిడ్ హార్మోన్ (T4)', hi: 'थायरॉइड हार्मोन (T4)' },
    low: {
      en: 'A low T4 can mean the thyroid is underactive and may cause tiredness or weight gain. Please show this report to your doctor.',
      te: 'T4 తక్కువగా ఉంటే థైరాయిడ్ తక్కువగా పనిచేస్తుండవచ్చు; అలసట, బరువు పెరగడం కలగవచ్చు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'T4 कम होने पर थायरॉइड कम सक्रिय हो सकता है और थकान या वज़न बढ़ना हो सकता है। कृपया रिपोर्ट डॉक्टर को दिखाएँ।',
    },
    high: {
      en: 'A high T4 can mean the thyroid is overactive and may cause a fast heartbeat or weight loss. Please show this report to your doctor.',
      te: 'T4 ఎక్కువగా ఉంటే థైరాయిడ్ ఎక్కువగా పనిచేస్తుండవచ్చు; గుండె వేగంగా కొట్టుకోవడం, బరువు తగ్గడం కలగవచ్చు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'T4 अधिक होने पर थायरॉइड ज़्यादा सक्रिय हो सकता है और दिल की तेज़ धड़कन या वज़न घटना हो सकता है। कृपया रिपोर्ट डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'vit_d', aliases: ['vitamin d', '25 oh vitamin d', 'vitamin d 25 hydroxy', 'vitamin d3'],
    name: { en: 'Vitamin D', te: 'విటమిన్ D', hi: 'विटामिन D' },
    low: {
      en: 'Vitamin D keeps bones strong. A low value is common and can cause bone or body aches. Morning sunlight helps; your doctor may advise supplements.',
      te: 'విటమిన్ D ఎముకలను బలంగా ఉంచుతుంది. తక్కువగా ఉండటం సాధారణం; ఎముకలు, ఒళ్ళు నొప్పులు కలగవచ్చు. ఉదయపు ఎండ సహాయపడుతుంది; డాక్టర్ సప్లిమెంట్లు సూచించవచ్చు.',
      hi: 'विटामिन D हड्डियों को मज़बूत रखता है। इसकी कमी आम है और हड्डियों या बदन में दर्द दे सकती है। सुबह की धूप मदद करती है; डॉक्टर सप्लिमेंट सुझा सकते हैं।',
    },
    high: {
      en: 'A high vitamin D is usually from taking too many supplements. Please tell your doctor what you are taking.',
      te: 'విటమిన్ D ఎక్కువగా ఉండటం సాధారణంగా సప్లిమెంట్లు ఎక్కువగా తీసుకోవడం వల్ల. మీరు తీసుకుంటున్న వాటి గురించి డాక్టర్‌కు చెప్పండి.',
      hi: 'विटामिन D अधिक होना आमतौर पर बहुत ज़्यादा सप्लिमेंट लेने से होता है। आप जो ले रहे हैं, डॉक्टर को बताएँ।',
    },
  },
  {
    key: 'b12', aliases: ['vitamin b12', 'b12', 'cyanocobalamin'],
    name: { en: 'Vitamin B12', te: 'విటమిన్ B12', hi: 'विटामिन B12' },
    low: {
      en: 'Vitamin B12 is needed for blood and nerves. A low value can cause tiredness, tingling in hands or feet, or anaemia. Your doctor can advise treatment.',
      te: 'విటమిన్ B12 రక్తం, నరాలకు అవసరం. తక్కువగా ఉంటే అలసట, చేతులు కాళ్ళలో జలదరింపు లేదా రక్తహీనత కలగవచ్చు. చికిత్స గురించి డాక్టర్ సలహా ఇస్తారు.',
      hi: 'विटामिन B12 खून और नसों के लिए ज़रूरी है। कम होने पर थकान, हाथ-पैरों में झुनझुनी या खून की कमी हो सकती है। इलाज पर डॉक्टर सलाह देंगे।',
    },
    high: FINE_HIGH,
  },
  {
    key: 'ferritin', aliases: ['ferritin', 'serum ferritin'],
    name: { en: 'Ferritin (iron store)', te: 'ఫెరిటిన్ (ఐరన్ నిల్వ)', hi: 'फेरिटिन (आयरन भंडार)' },
    low: {
      en: 'Ferritin shows the iron stored in your body. A low value means low iron stores, a common cause of tiredness. Your doctor can advise on iron and diet.',
      te: 'ఫెరిటిన్ మీ శరీరంలో నిల్వ ఉన్న ఐరన్‌ను చూపిస్తుంది. తక్కువగా ఉంటే ఐరన్ నిల్వలు తక్కువ; ఇది అలసటకు సాధారణ కారణం. ఐరన్, ఆహారం గురించి డాక్టర్ సలహా ఇస్తారు.',
      hi: 'फेरिटिन शरीर में जमा आयरन दिखाता है। कम होने का मतलब आयरन का भंडार कम है, जो थकान का आम कारण है। आयरन और आहार पर डॉक्टर सलाह देंगे।',
    },
    high: {
      en: 'A high ferritin can be seen with inflammation, liver problems or too much iron. Please show this report to your doctor.',
      te: 'ఫెరిటిన్ ఎక్కువగా ఉంటే వాపు, కాలేయ సమస్యలు లేదా ఐరన్ ఎక్కువ కావడం కారణం కావచ్చు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'फेरिटिन अधिक होना सूजन, लिवर की समस्या या ज़्यादा आयरन से हो सकता है। कृपया रिपोर्ट डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'esr', aliases: ['esr', 'erythrocyte sedimentation rate'],
    name: { en: 'ESR', te: 'ESR', hi: 'ESR' },
    low: FINE_LOW,
    high: {
      en: 'ESR goes up when there is inflammation or infection somewhere in the body. It does not say where. Please show this report to your doctor.',
      te: 'శరీరంలో ఎక్కడైనా వాపు లేదా ఇన్ఫెక్షన్ ఉన్నప్పుడు ESR పెరుగుతుంది. అది ఎక్కడో ఇది చెప్పదు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'शरीर में कहीं सूजन या संक्रमण होने पर ESR बढ़ता है। यह नहीं बताता कि कहाँ। कृपया रिपोर्ट डॉक्टर को दिखाएँ।',
    },
  },
  {
    key: 'crp', aliases: ['crp', 'c reactive protein'],
    name: { en: 'CRP', te: 'CRP', hi: 'CRP' },
    low: FINE_LOW,
    high: {
      en: 'CRP goes up when there is inflammation or infection in the body. It does not say where. Please show this report to your doctor.',
      te: 'శరీరంలో వాపు లేదా ఇన్ఫెక్షన్ ఉన్నప్పుడు CRP పెరుగుతుంది. అది ఎక్కడో ఇది చెప్పదు. దయచేసి ఈ రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
      hi: 'शरीर में सूजन या संक्रमण होने पर CRP बढ़ता है। यह नहीं बताता कि कहाँ। कृपया रिपोर्ट डॉक्टर को दिखाएँ।',
    },
  },
];

// Used when a test is not listed above and the AI is unavailable, fails
// validation, or is switched off. Deliberately generic and always safe.
const FALLBACK = {
  low: {
    en: 'This result is lower than the usual range printed on your report. That does not always mean something is wrong. Please show the full report to your doctor.',
    te: 'ఈ ఫలితం మీ రిపోర్ట్‌లో ముద్రించిన సాధారణ పరిధి కంటే తక్కువగా ఉంది. దీని అర్థం ఏదో సమస్య ఉందని ఎప్పుడూ కాదు. దయచేసి పూర్తి రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
    hi: 'यह परिणाम आपकी रिपोर्ट में छपी सामान्य सीमा से कम है। इसका मतलब हमेशा कोई समस्या नहीं होता। कृपया पूरी रिपोर्ट अपने डॉक्टर को दिखाएँ।',
  },
  high: {
    en: 'This result is higher than the usual range printed on your report. That does not always mean something is wrong. Please show the full report to your doctor.',
    te: 'ఈ ఫలితం మీ రిపోర్ట్‌లో ముద్రించిన సాధారణ పరిధి కంటే ఎక్కువగా ఉంది. దీని అర్థం ఏదో సమస్య ఉందని ఎప్పుడూ కాదు. దయచేసి పూర్తి రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
    hi: 'यह परिणाम आपकी रिपोर्ट में छपी सामान्य सीमा से अधिक है। इसका मतलब हमेशा कोई समस्या नहीं होता। कृपया पूरी रिपोर्ट अपने डॉक्टर को दिखाएँ।',
  },
};

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const INDEX = new Map();
for (const t of TESTS) for (const a of t.aliases) INDEX.set(norm(a), t);

/** Exact alias match only, so "Lipoprotein (a)" can never be mistaken for a cholesterol test. */
function findTest(name) {
  return INDEX.get(norm(name)) ?? null;
}

module.exports = { TESTS, FALLBACK, LANGS: L, findTest };
