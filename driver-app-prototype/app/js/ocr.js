/* ---------------------------------------------------------
   차량등록증 사진 OCR — Gemini(Google AI Studio) 비전 API 호출.
   window.SE_CONFIG.GEMINI_API_KEY 없으면 app.js가 이 모듈을
   호출하지 않고 기존 mock 인식으로 대체 처리함(항상 화면은 동작).
--------------------------------------------------------- */
(function () {
  'use strict';

  var MODEL = 'gemini-2.5-flash';
  var TIMEOUT_MS = 30000;
  var PROMPT = [
    '이 이미지는 화물차 차량등록증 사진입니다. 아래 6개 항목만 JSON 객체로 답하세요.',
    '읽을 수 없거나 사진에 없는 항목은 반드시 null로 답하세요. 다른 텍스트는 출력하지 마세요.',
    '{',
    '  "plate": "차량번호, 문자열",',
    '  "vin": "차대번호(VIN), 문자열",',
    '  "regMileage": "등록증에 기재된 주행거리, 숫자(km)",',
    '  "lastInspectionDate": "최종 검사일/점검일, YYYY-MM-DD",',
    '  "vehicleType": "축/바퀴 구성으로 추정한 6 또는 8 (불확실하면 null)",',
    '  "currentMileage": "계기판 등에 보이는 현재 누적 주행거리, 숫자(km)"',
    '}'
  ].join('\n');

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = function () { reject(new Error('file read failed')); };
      reader.readAsDataURL(file);
    });
  }

  function recognize(file) {
    var key = window.SE_CONFIG && window.SE_CONFIG.GEMINI_API_KEY;
    if (!key) return Promise.reject(new Error('no gemini key configured'));

    return fileToBase64(file).then(function (base64) {
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + key;
      var body = {
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: file.type || 'image/jpeg', data: base64 } }
          ]
        }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 }
      };

      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      }).then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('gemini http ' + res.status);
        return res.json();
      }).then(function (data) {
        var text = data && data.candidates && data.candidates[0] &&
          data.candidates[0].content && data.candidates[0].content.parts &&
          data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
        if (!text) throw new Error('empty gemini response');
        return JSON.parse(text);
      }).catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
    });
  }

  window.SE_OCR = { recognize: recognize };
})();
