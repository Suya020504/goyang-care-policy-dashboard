# 닿지 않는 돌봄

고양시 교통·복지 담당자가 **현장조사를 먼저 검토할 행정동을 좁히고**, DRT·고정노선·바우처 택시·복지셔틀·방문서비스를 함께 비교하는 정책 사전검토 대시보드입니다.

이 저장소는 팀 `도달`의 2026년 고양시 빅데이터 공모전 본선 준비용 공개 MVP입니다. 고양시 공식 서비스가 아니며, 개인의 실제 돌봄 필요도·이동경로·서비스 이용기록을 사용하지 않습니다.

- 라이브 MVP: <https://goyang-care-policy-dashboard.vercel.app/>
- 관객용 HTML 발표자료: <https://goyang-care-policy-dashboard.vercel.app/presentation/>
- 발표자 대본·대조 화면: <https://goyang-care-policy-dashboard.vercel.app/presenter/>
- GitHub: <https://github.com/Suya020504/goyang-care-policy-dashboard>
- 분석 단위: 고양시 44개 행정동
- 실행 방식: 정적 HTML, 서버·로그인·API 키 없음

## 무엇을 보여 주나

1. **현황 GIS** — 44개 행정동, 7개 지표, 경계 안 정류장·의료 공급점
2. **후보 비교** — 제출 보고서의 후보 8개를 같은 집합으로 재현하고 원인 신호를 비교
3. **재검증 근거** — 포스터 주장 29건, DSS 값 차이, 민감도·공간통계·반증 결과
4. **정책 시나리오** — 5개 대안을 시연용 공개 규칙으로 비교하고 KPI·검토 사유를 저장

대시보드는 사업 도입지를 자동 결정하지 않습니다. 결과는 **우선검토 후보와 추가 데이터 요청 순서**를 돕는 공개데이터 대리진단입니다.

## 핵심 재검증 결과

| 항목 | 재계산 결과 | 해석 경계 |
|---|---:|---|
| 주민등록인구 | 1,057,438명 | 2026-06-30 |
| 65세 이상 | 204,878명 · 19.4% | 110세 이상 2명 포함 |
| 70세 이상 1인세대 | 35,295세대 | 돌봄 필요자 수가 아님 |
| 병·의원 등·약국 | 접근성 계산 1,893행 | 고양온돌 서비스 거점이 아님 |
| 버스정류장 | 원파일 2,099행 · 경계 안 2,095개 | 2025-08-25 혼합시점 |
| 후보 재현 | 집합 8/8 일치 | DSS MAE 0.174, 내부순위 MAE 2.00 |
| 주장 검증 | 확인 7 · 조건부 9 · 수정 13 | 총 29건 |
| 지정범위 가중치 | 45개, 최저 Jaccard 0.455 | 45/45 유지 5곳, 선정확률 아님 |
| 전체 simplex 감사 | 231개, 최저 Jaccard 0.333 | 231/231 유지 고양동 1곳 |

45개 지정범위와 231개 경계감사를 함께 공개하는 이유는, 후보 집합이 가중치 선택에 얼마나 의존하는지 숨기지 않기 위해서입니다. 제출 후보 8개는 유지하되 확정 순위·최적지로 부르지 않습니다.

## 데이터와 기준일

| 데이터 | 기준일 | 이용조건 |
|---|---|---|
| 행정안전부 행정동 성·연령 주민등록인구 | 2026-06-30 | 이용허락범위 제한 없음 |
| 행정안전부 행정동 성·연령 1인세대 | 2026-06-30 | 이용허락범위 제한 없음 |
| 건강보험심사평가원 전국 병의원 및 약국 현황 | 2026-06 | 공공누리 제1유형 |
| 경기도 고양시 버스정류장 현황 | 2025-08-25 | 이용허락범위 제한 없음 |
| SGIS 기반 `vuski/admdongkor` 행정동 경계 | 2026-04-01 | CC BY 4.0 + 공공누리 제1유형 |

세부 URL·가공 방식·SHA-256·해석 제한은 [데이터 계보](reports/DATA_LINEAGE.md), [분석 방법](reports/PRO_ANALYSIS_METHOD.md), [제3자 고지](THIRD_PARTY_NOTICES.md)에서 확인할 수 있습니다.

## 실행

`index.html`을 Chrome 또는 Edge로 열면 인터넷 없이 동작합니다. 정적 서버로 실행하려면 저장소 루트에서 다음 명령을 사용할 수 있습니다.

```powershell
python -m http.server 4173
```

그다음 <http://localhost:4173>을 엽니다.

### 발표자료

- 관객 화면: `presentation/index.html`
- 발표자 대본·대조 화면: `presenter/index.html`
- 특정 슬라이드 직접 열기: `presentation/index.html?slide=11`
- 발표자 화면 특정 슬라이드: `presenter/index.html?slide=14`

관객 화면은 15장 16:9 덱이며 화살표·Home/End·전체화면·인쇄/PDF를 지원합니다. 발표자 화면은 관객 슬라이드와 별도 대본을 나란히 보여 주며, 본 발표 12분·화면 전환 1분·MVP 2분의 진행 시간을 계산합니다. 관객용 `presentation/**`에는 대본 데이터가 포함되지 않습니다.

## 테스트

Node.js 20 이상에서 데이터 계약·정책 규칙·공개 배포 검사를 실행할 수 있습니다. 단위 테스트는 설치 없이 실행되고, 브라우저 검사용 `playwright-core`는 `npm install`로 준비합니다.

```powershell
npm.cmd test
```

브라우저 검사는 Playwright가 준비된 환경에서 실행합니다.

```powershell
$env:PLAYWRIGHT_CHROMIUM_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run test:browser
```

발표자료만 확인하려면 다음 명령을 사용합니다.

```powershell
npm.cmd run test:presentation
```

## 공개판 GIS

초기 로컬 MVP의 고양시 생활지도 파생 경계는 공개 재배포 조건이 확인되지 않아 제외했습니다. 공개판은 제출 재현분석에 실제 사용한 `admdongkor` 2026-04-01 경계로 다시 생성했으며, SGIS와 `admdongkor`를 함께 출처표시합니다.

유지관리자가 검증된 원자료를 보유한 경우 다음 스크립트로 표시 경계를 다시 생성할 수 있습니다.

```powershell
python scripts/build_public_boundary.py `
  --boundary data/raw/admdongkor_HangJeongDong_ver20260401.geojson `
  --bus-stops data/processed/bus_stops.csv `
  --facilities data/processed/facilities.csv
```

원자료는 라이선스·용량·계보 분리를 위해 이 저장소에 포함하지 않습니다.

## 개인정보

서버 전송과 사용자 추적은 없습니다. 정책 화면의 검토 상태와 자유서술 사유는 현재 브라우저의 `localStorage`에만 저장됩니다. 공용 PC에서는 개인정보를 입력하지 말고 시연 후 초기화하세요. 자세한 내용은 [PRIVACY.md](PRIVACY.md)를 확인하세요.

## 문서

- [데이터·차트 계보](reports/DATA_LINEAGE.md)
- [전문 분석 방법](reports/PRO_ANALYSIS_METHOD.md)
- [데이터 라이선스](DATA_LICENSES.md)
- [변경 이력](CHANGELOG.md)
- [기여 가이드](CONTRIBUTING.md)
- [발표자료 구성·사용법](reports/PRESENTATION.md)

## 라이선스

팀이 작성한 코드·디자인·보고서는 별도 허가가 없는 한 모든 권리를 보유합니다. 제3자 공공데이터와 경계 파생물은 각 원 라이선스를 따릅니다. 자세한 범위는 [LICENSE](LICENSE)와 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 확인하세요.
