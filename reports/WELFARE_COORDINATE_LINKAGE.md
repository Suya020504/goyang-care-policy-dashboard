# 복지시설 공식 좌표와 44동 접근성 보완

기준일: 2026-08-13

## 결론

경기데이터드림 무키 Sheet에서 고양시 경로당 원자료 591행 중 유효좌표 585건(2025-06-30), 노인복지관 3/3건(2026-02-27), 노인돌봄서비스 수행기관 10/10건(2026-03-02)의 WGS84 좌표를 확보했다. 2026년 6월 고양시 공식 경로당 Excel 594행은 공개 좌표목록과 명칭·주소로 연결했으며, exact/normalized/manual/unmatched 상태를 분리했다.

공개 웹앱 파일에는 시설명·주소·전화·팩스·담당연락처를 넣지 않고 익명 좌표와 44동 집계만 제공한다.

## 594행 명칭·주소 연결 품질

- exact: 157행
- normalized: 418행
- manual: 7행 (후보만 제시, 좌표 미연결)
- unmatched: 12행
- 자동 연결: 575/594행
- 유효 좌표 완성: 570/594행

유사도 점수만으로 manual 후보를 자동 확정하지 않았다. 이 연결 품질은 2026년 6월 594행 목록과 2025-06-30 591행 좌표목록의 버전 차이를 포함한다.

## 좌표 미완성의 후보군 편향 점검

- 기준 후보 8동: 5/118행 미완성 (4.237%)
- 비후보 36동: 19/476행 미완성 (3.992%)
- 차이 +0.246%p · 위험비 1.062 · Fisher 정확검정 양측 p=0.800

후보군 전체에 좌표 미완성이 과집중됐다는 신호는 관찰되지 않았다. 이는 편향이 없다는 확정이 아니며, 대덕동 등 개별 행정동의 누락은 계속 확인해야 한다. 개인정보 없는 집계는 `outputs/tables/welfare_coordinate_missingness_audit.csv`로 공개한다.

## 지표 해석

- 100m 동일면적 격자에서 최근접 시설까지의 EPSG:5179 직선거리
- 0.8m/s 보행속도 가정의 5·10·15·30분 이내 격자 비율
- 도로망·경사·운영시간·이용자격·수용력·OD·대기·환승 미포함

따라서 이 값은 복지 목적지의 공간 분산을 비교하는 대리값이지 주민 도달률이나 DRT 정책효과가 아니다.

## 절대 혼동 금지

경기데이터드림의 노인돌봄서비스 수행기관 10건은 고양온돌의 62개 서비스 위치가 아니다. 경로당과 노인복지관 역시 온돌 서비스 제공지로 동일시하지 않는다.

## 공식 출처

- [경기도_노인여가복지시설(경로당) 현황](https://data.gg.go.kr/portal/data/service/selectServicePage.do?infId=NGS4J4YYWWRDTBH68PWM27749178&infSeq=1) — 기준일 2025-06-30, 전체/고양 10296/591행, SHA-256 `0A744AC4018AC136F04C72652C00E8E3C855F40FAA6482DCC1AFA87BE71E8B0C`
- [경기도_노인여가복지시설(노인복지관) 현황](https://data.gg.go.kr/portal/data/service/selectServicePage.do?infId=MGVBGBH0FKD48G8QQ4I827687767&infSeq=1) — 기준일 2026-02-27, 전체/고양 73/3행, SHA-256 `60B8C0CB7F09353FE5EC4417EEA7FA34D0901C74B0AC1A94D043B5CBAFF9C8BC`
- [경기도_노인돌봄서비스 수행기관 현황](https://data.gg.go.kr/portal/data/service/selectServicePage.do?infId=AOY7I1SKRJ7IM0ZJQSN528372736&infSeq=1) — 기준일 2026-03-02, 전체/고양 114/10행, SHA-256 `F23ED3AFCF7CB3B4DAFA42E6F50D6361021965B745C5DB22385416FDA51ACE6C`
- [고양시 2026년 6월 경로당 Excel](https://www.goyang.go.kr/www/publict/ntt/BD_selectPublictNttList.do?q_publictJobSn=100489) — 고양 594행, SHA-256 `338956CF678BFD9BB8EE456A5AD8F59A354000D6DC7EA2F2E237910180253227`

연락처가 포함될 수 있는 원본은 비공개 재현분석 공간에만 보존한다. 공개 저장소에는 원본 해시·집계·익명 좌표만 제공한다.
