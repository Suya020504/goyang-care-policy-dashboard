---
title: 복지 목적지 정의에 따른 DSS 후보순위 민감도
date: 2026-08-13
status: verified_proxy_sensitivity
---

# 복지 목적지 정의에 따른 DSS 후보순위 민감도

## 결론

이 분석은 **의료 목적지를 공개 복지 목적지 대리층으로 바꿔도 기존 Top8이 유지되는가**를 검증한 민감도 분석이다. 11개 복지 치환 시나리오의 기준 Top8 대비 Jaccard 최솟값은 **0.333**, 최대 교체는 **4/8동**이다. 모든 치환 시나리오에서 Top8을 유지한 안정 핵심은 **가좌동, 효자동, 고양동, 관산동**이다.

다만 이것은 새 후보선정 모형을 확정한 결과가 아니다. 경로당 585건, 노인복지관 3건, 노인돌봄 수행기관 10건은 서로 다른 목록·기준일이며, **공식 고양온돌 62개 서비스 제공위치·이용실적·운영제약이 아닌 공개 복지목적지 대리층**이다.

## 분석 목적과 의사결정 질문

- 목적: 심사 피드백인 “의료 시설 외 복지·생활 목적지를 검증하라”를 공개좌표로 스트레스 테스트한다.
- 질문: 목적지 정의만 바꿔도 Top8과 관산·행주·대화동의 순위가 크게 바뀌는가?
- 의사결정: 특정 동을 즉시 선정하지 않고, 목적지 정의에 따라 바뀌지 않는 안정 후보와 현장확인 필요 후보를 구분한다.

## 베이스라인과 치환 시나리오

- 베이스라인: 기존 26,595개 100m 격자, 수요지수, 버스 비효율, HIRA 의료·약국 RI/최근거리, DSS 가중 0.5/0.3/0.2.
- 부분 치환: CAG의 의료 RI는 유지하고, DSS의 명시적 시설분산 항만 복지 목적지 최근거리로 바꾼다.
- 완전 치환: CAG의 RI와 DSS 시설분산 항을 모두 동일 복지 목적지 대리층으로 바꾼다.
- 결합 레코드 동일가중: 598개 레코드를 각 1로 두어 경로당 585건이 지배하는 자연스러운 결과를 그대로 노출한다.
- 결합 목록 동일가중: 세 목록의 RI 총기여를 각 1/3로 맞춰 목록 크기 차이의 기계적 지배를 줄인다.

확률모형이 아니므로 random seed는 해당 없다. 모든 계산은 EPSG:5179 직선거리, 0.8m/s 보행, beta=0.10으로 결정적으로 계산했다.

## 시나리오별 Top8

| 시나리오 | 치환 범위 | Jaccard | 교체 | Top8 순서 | 이탈 | 진입 |
|---|---|---:|---:|---|---|---|
| baseline_medical | baseline_medical | 1.000 | 0 | 가좌동 · 효자동 · 고양동 · 주교동 · 행주동 · 관산동 · 능곡동 · 송포동 | - | - |
| partial_senior_centers | partial_facility_term_only | 1.000 | 0 | 가좌동 · 효자동 · 주교동 · 관산동 · 행주동 · 고양동 · 능곡동 · 송포동 | - | - |
| full_senior_centers | full_cag_and_facility_term | 0.600 | 2 | 주교동 · 효자동 · 관산동 · 가좌동 · 고양동 · 행주동 · 성사2동 · 백석2동 | 능곡동 · 송포동 | 백석2동 · 성사2동 |
| partial_senior_welfare_centers | partial_facility_term_only | 0.778 | 1 | 고양동 · 관산동 · 가좌동 · 효자동 · 행주동 · 주교동 · 능곡동 · 중산1동 | 송포동 | 중산1동 |
| full_senior_welfare_centers | full_cag_and_facility_term | 0.333 | 4 | 고양동 · 효자동 · 일산1동 · 일산2동 · 관산동 · 가좌동 · 행신1동 · 행신3동 | 능곡동 · 송포동 · 주교동 · 행주동 | 일산1동 · 일산2동 · 행신1동 · 행신3동 |
| partial_elder_care_providers | partial_facility_term_only | 0.600 | 2 | 관산동 · 고양동 · 가좌동 · 주교동 · 행주동 · 효자동 · 중산1동 · 일산1동 | 능곡동 · 송포동 | 일산1동 · 중산1동 |
| full_elder_care_providers | full_cag_and_facility_term | 0.333 | 4 | 관산동 · 일산1동 · 고양동 · 가좌동 · 일산2동 · 중산1동 · 효자동 · 탄현1동 | 능곡동 · 송포동 · 주교동 · 행주동 | 일산1동 · 일산2동 · 중산1동 · 탄현1동 |
| partial_senior_centers_latest_linked_570 | partial_facility_term_only | 1.000 | 0 | 가좌동 · 효자동 · 주교동 · 관산동 · 행주동 · 고양동 · 능곡동 · 송포동 | - | - |
| full_senior_centers_latest_linked_570 | full_cag_and_facility_term | 0.600 | 2 | 주교동 · 효자동 · 관산동 · 가좌동 · 고양동 · 행주동 · 성사2동 · 백석2동 | 능곡동 · 송포동 | 백석2동 · 성사2동 |
| partial_combined_union | partial_facility_term_only | 1.000 | 0 | 가좌동 · 효자동 · 주교동 · 관산동 · 행주동 · 고양동 · 능곡동 · 송포동 | - | - |
| full_combined_record_equal | full_cag_and_facility_term | 0.600 | 2 | 주교동 · 효자동 · 관산동 · 가좌동 · 고양동 · 행주동 · 성사2동 · 백석2동 | 능곡동 · 송포동 | 백석2동 · 성사2동 |
| full_combined_layer_equal | full_cag_and_facility_term | 0.600 | 2 | 효자동 · 가좌동 · 행주동 · 고양동 · 주교동 · 관산동 · 일산1동 · 일산2동 | 능곡동 · 송포동 | 일산1동 · 일산2동 |

## 관산·행주·대화동 비교

`rank change`는 양수일수록 기준보다 순위가 낮아졌다는 뜻이다. 거리와 CAG는 보행로망·경사·운영시간이 없는 공간 대리층이다.

| 시나리오 | 행정동 | 전역순위 | 후보순위 | Top8 | 최근거리 평균(m) | CAG | rank change |
|---|---|---:|---:|---|---:|---:|---:|
| baseline_medical | 관산동 | 7 | 6 | Y | 834.3 | 1.227 | +0 |
| baseline_medical | 행주동 | 6 | 5 | Y | 1358.4 | 0.790 | +0 |
| baseline_medical | 대화동 | 38 | 35 | N | 289.3 | -0.752 | +0 |
| partial_senior_centers | 관산동 | 5 | 4 | Y | 530.5 | 1.227 | -2 |
| partial_senior_centers | 행주동 | 6 | 5 | Y | 641.1 | 0.790 | +0 |
| partial_senior_centers | 대화동 | 38 | 35 | N | 294.5 | -0.752 | +0 |
| full_senior_centers | 관산동 | 4 | 3 | Y | 530.5 | 1.213 | -3 |
| full_senior_centers | 행주동 | 7 | 6 | Y | 641.1 | 0.701 | +1 |
| full_senior_centers | 대화동 | 40 | 37 | N | 294.5 | -0.719 | +2 |
| partial_senior_welfare_centers | 관산동 | 3 | 2 | Y | 7291.2 | 1.227 | -4 |
| partial_senior_welfare_centers | 행주동 | 6 | 5 | Y | 4864.6 | 0.790 | +0 |
| partial_senior_welfare_centers | 대화동 | 38 | 35 | N | 853.0 | -0.752 | +0 |
| full_senior_welfare_centers | 관산동 | 6 | 5 | Y | 7291.2 | 0.682 | -1 |
| full_senior_welfare_centers | 행주동 | 10 | 9 | N | 4864.6 | 0.485 | +4 |
| full_senior_welfare_centers | 대화동 | 44 | 41 | N | 853.0 | -2.829 | +6 |
| partial_elder_care_providers | 관산동 | 2 | 1 | Y | 6631.1 | 1.227 | -5 |
| partial_elder_care_providers | 행주동 | 6 | 5 | Y | 1993.5 | 0.790 | +0 |
| partial_elder_care_providers | 대화동 | 38 | 35 | N | 802.2 | -0.752 | +0 |
| full_elder_care_providers | 관산동 | 2 | 1 | Y | 6631.1 | 0.874 | -5 |
| full_elder_care_providers | 행주동 | 11 | 10 | N | 1993.5 | 0.405 | +5 |
| full_elder_care_providers | 대화동 | 43 | 40 | N | 802.2 | -1.803 | +5 |
| partial_senior_centers_latest_linked_570 | 관산동 | 5 | 4 | Y | 531.2 | 1.227 | -2 |
| partial_senior_centers_latest_linked_570 | 행주동 | 6 | 5 | Y | 644.2 | 0.790 | +0 |
| partial_senior_centers_latest_linked_570 | 대화동 | 38 | 35 | N | 294.5 | -0.752 | +0 |
| full_senior_centers_latest_linked_570 | 관산동 | 4 | 3 | Y | 531.2 | 1.212 | -3 |
| full_senior_centers_latest_linked_570 | 행주동 | 7 | 6 | Y | 644.2 | 0.701 | +1 |
| full_senior_centers_latest_linked_570 | 대화동 | 41 | 38 | N | 294.5 | -0.743 | +3 |
| partial_combined_union | 관산동 | 5 | 4 | Y | 530.5 | 1.227 | -2 |
| partial_combined_union | 행주동 | 6 | 5 | Y | 641.1 | 0.790 | +0 |
| partial_combined_union | 대화동 | 38 | 35 | N | 294.0 | -0.752 | +0 |
| full_combined_record_equal | 관산동 | 4 | 3 | Y | 530.5 | 1.225 | -3 |
| full_combined_record_equal | 행주동 | 7 | 6 | Y | 641.1 | 0.709 | +1 |
| full_combined_record_equal | 대화동 | 41 | 38 | N | 294.0 | -0.796 | +3 |
| full_combined_layer_equal | 관산동 | 7 | 6 | Y | 530.5 | 0.935 | +0 |
| full_combined_layer_equal | 행주동 | 4 | 3 | Y | 641.1 | 0.567 | -2 |
| full_combined_layer_equal | 대화동 | 44 | 41 | N | 294.0 | -2.359 | +6 |

## 기준 Top8 안정성

| 행정동 | 복지 치환 Top8 횟수 | 유지율 |
|---|---:|---:|
| 가좌동 | 11/11 | 100.0% |
| 효자동 | 11/11 | 100.0% |
| 고양동 | 11/11 | 100.0% |
| 관산동 | 11/11 | 100.0% |
| 주교동 | 9/11 | 81.8% |
| 행주동 | 9/11 | 81.8% |
| 능곡동 | 4/11 | 36.4% |
| 송포동 | 3/11 | 27.3% |

이 표의 유지율은 복지 치환 11개 시나리오 내 기술 안정성이지, 현실 정책효과 확률이 아니다.

## 경로당 버전 민감도: 585 대 570

2025-06-30 공개좌표 585건과 2026-06 최신 경로당 594행 중 엄격 연결로 좌표가 완성된 570행을 별도로 계산했다. 후자는 최신 목록이지만 신규 좌표 조사가 아니라 2025 공개좌표와 연결된 부분집합이다. **24행의 좌표 미완성**은 남아 있다.

| 치환 범위 | 행정동 | Top8 Jaccard(585 vs 570) | 585 순위 | 570 순위 | 변화 | 585 거리(m) | 570 거리(m) |
|---|---|---:|---:|---:|---:|---:|---:|
| partial_facility_term_only | 관산동 | 1.000 | 5 | 5 | +0 | 530.5 | 531.2 |
| partial_facility_term_only | 행주동 | 1.000 | 6 | 6 | +0 | 641.1 | 644.2 |
| partial_facility_term_only | 대화동 | 1.000 | 38 | 38 | +0 | 294.5 | 294.5 |
| full_cag_and_facility_term | 관산동 | 1.000 | 4 | 4 | +0 | 530.5 | 531.2 |
| full_cag_and_facility_term | 행주동 | 1.000 | 7 | 7 | +0 | 641.1 | 644.2 |
| full_cag_and_facility_term | 대화동 | 1.000 | 40 | 41 | +1 | 294.5 | 294.5 |

## 누수·사후정보 통제

- 기존 `candidate_top8` 결과 플래그는 점수 계산에 사용하지 않았다.
- DRT 이용실적·성과·도입 후 사후정보는 입력에 없다.
- 현행 DRT 3동 제외은 **과거 팀의 사후 대리매핑**을 재현한 것으로 효과 검증값이 아니다. 점수 입력이 아니라 후보 풀에서만 제외했다.
- 시설명·주소는 좌표 연결 단계에만 쓰고 공개 산출물에는 남기지 않았다.

## 입력 무결성

| 입력 | 행수 | 기준일 | SHA-256 |
|---|---:|---|---|
| baseline_area_scores | 44 | mixed_2026-06-30 | `455106174A3E492D501F73B8BA55EFD1B7525656638E8109AE015C290C352DE3` |
| baseline_grid_scores | 26,595 | boundary_2026-04-01 | `F2B4631D6C4DB1C379BB9CAA13D29A9C055273F1C0D682BAC13EDD19C0A9E9BF` |
| senior_centers | 585 | 2025-06-30 | `CEEA44E2A4F45EEC9E0419811CDEF10A926B21F3EB243E49B824D23A4E65AA74` |
| senior_welfare_centers | 3 | 2026-02-27 | `75BED62CB76B623804C7A6A27907BD20CC936C8F2163E6D45B35D1245E2EFEFE` |
| elder_care_providers | 10 | 2026-03-02 | `C8EEAAAFFE83DE53492F63B1D1DA552B22C0C967E20F4D2E40871355DA6ADD59` |
| senior_centers_latest_workbook_linkage | 594 | 2026-06 | `351BA8E581AD4F010034B2B902450B84346E2046B71790E3C197CD88D97463EA` |

## 데이터 품질·결정성 점검

| 점검 | 관측 | 기대 | 결과 | 메모 |
|---|---:|---:|---|---|
| area_rows | 44.0 | 44.0 | PASS | 44동 1:1 |
| grid_rows | 26595.0 | 26595.0 | PASS | 동일 100m 격자 |
| grid_unique_id | 26595.0 | 26595.0 | PASS | 격자 ID 중복 0 |
| senior_center_valid_coordinates | 585.0 | 585.0 | PASS | 2025-06-30 공개좌표 |
| senior_center_duplicate_source_ids | 0.0 | 0.0 | PASS | 중복 0 |
| senior_center_latest_coordinate_complete | 570.0 | 570.0 | PASS | 2026-06 최신 594행 중 24행 좌표 미완성 |
| senior_welfare_center_valid_coordinates | 3.0 | 3.0 | PASS | 2026-02-27 공개좌표 |
| elder_care_provider_valid_coordinates | 10.0 | 10.0 | PASS | 2026-03-02 공개좌표 |
| baseline_dss_max_abs_difference | 1.8141044222375058e-13 | 0.0 | PASS | 기존 DSS 44행 재계산 포스터 대리모형 계약 일치 |
| scenario_rows | 528.0 | 528.0 | PASS | 12 시나리오 x 44동 |

## 방어 가능한 해석

1. **프로덕션 DSS 대체로 방어 가능한 시나리오는 아직 없다.** 실제 62개 서비스 위치·이용실적·운영제약이 없다.
2. **목록 동일가중 완전 치환**은 585/3/10의 크기 차이가 RI를 자동 지배하는 문제를 줄인 가장 방어 가능한 **스트레스 테스트**다. 단, 1/3은 정책 가치판단이 아니라 민감도 규칙이다.
3. 발표에서는 특정 시나리오의 새 순위를 “정답”으로 제시하지 말고, 안정 핵심·이탈·진입 후보와 현장 확인 순서를 보여 줘야 한다.

## 한계와 다음 자료

- 경로당·복지관·수행기관이 실제 고양온돌 이용 목적지인지 확인하지 못했다.
- 최신 경로당 594행 중 24행은 좌표가 미완성이며, 이 누락의 위치별 편향을 완전히 제거하지 못했다.
- 직선보행 거리이므로 보행로망, 경사, 신호, 버스 대기·환승을 반영하지 못했다.
- 운영시간, 이용자격, 수용력, 방문빈도, 비식별 OD가 없어 접근성을 실제 이용가능성으로 해석할 수 없다.
- 기관 협조로 62개 서비스 제공위치·비식별 OD·시간대별 대기·승하차를 받으면 동일 틀에서 대리층과 실측층을 교차검증한다.

## 재현

공개 저장소에서는 배포된 요약표·JS 계약과 개인정보 비노출을 다음 명령으로 검증한다.

```powershell
node --test tests/welfare-destination-sensitivity.test.js
```

원자료에서 전체 산출물을 다시 만드는 명령은 공개 저장소가 아니라 Vault의 `2026-08-09_재현분석` 폴더에서만 실행한다. 원자료와 비공개 결합표가 필요하며 공개 저장소 단독 재생성 명령이 아니다.

```powershell
python src/feedback_welfare_destination_sensitivity.py all --public-repo <public-repo>
python -m unittest tests.test_feedback_welfare_destination_sensitivity -v
```
