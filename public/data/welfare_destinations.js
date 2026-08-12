window.DDOL_WELFARE_DESTINATIONS = Object.freeze({
  metadata: Object.freeze({
    schemaVersion: '1.0.0',
    checkedAt: '2026-08-13',
    currentWebDisplayedTotal: 593,
    workbookRecordCount: 594,
    workbookInternalReference: '2026-06',
    workbookSha256: '338956CF678BFD9BB8EE456A5AD8F59A354000D6DC7EA2F2E237910180253227',
    sourceSummarySha256: 'FB24C41E07B8C550C4C542EEEA7704128736640041EDCBD4ED7A47606AB33DA9',
    seniorWelfareCenterCount: 3,
    coordinateCount: 0,
    coordinateStatus: 'juso_confm_key_required',
    sources: Object.freeze([
      'https://www.goyang.go.kr/www/hsfhgSttus/BD_selectHsfhgSttusList.do',
      'https://www.goyang.go.kr/www/publict/ntt/BD_selectPublictNttList.do?q_publictJobSn=100489',
      'https://www.goyang.go.kr/www/www03/www03_8/www03_8_3/www03_8_3_tab10.jsp',
    ]),
    interpretation: '공식 목록과 행정동 집계는 확보했지만 좌표·운영시간·이용자격이 없어 접근성은 계산하지 않았다.',
  }),
  areaRows: Object.freeze([
    ['가좌동',14],['고봉동',20],['고양동',28],['관산동',16],['능곡동',17],['대덕동',11],['대화동',23],['덕이동',16],
    ['마두1동',14],['마두2동',8],['백석1동',17],['백석2동',7],['삼송1동',11],['삼송2동',12],['성사1동',7],['성사2동',8],
    ['송포동',12],['식사동',13],['원신동',15],['일산1동',18],['일산2동',16],['일산3동',17],['장항1동',6],['장항2동',7],
    ['정발산동',16],['주교동',7],['주엽1동',18],['주엽2동',20],['중산1동',13],['중산2동',9],['창릉동',11],['탄현1동',17],
    ['탄현2동',7],['풍산동',20],['행신1동',12],['행신2동',21],['행신3동',9],['행신4동',9],['행주동',13],['화전동',16],
    ['화정1동',10],['화정2동',10],['효자동',11],['흥도동',12],
  ].map(([dong, seniorCenterCount]) => Object.freeze({ dong, seniorCenterCount }))),
});
