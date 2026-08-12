import csv
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "build_bus_network_evidence.py"
SPEC = importlib.util.spec_from_file_location("bus_network_evidence", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)
FETCH_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "fetch_official_bus_evidence.py"
FETCH_SPEC = importlib.util.spec_from_file_location("fetch_official_bus_evidence", FETCH_SCRIPT)
FETCH_MODULE = importlib.util.module_from_spec(FETCH_SPEC)
assert FETCH_SPEC and FETCH_SPEC.loader
FETCH_SPEC.loader.exec_module(FETCH_MODULE)


def write_csv(path, headers, rows, encoding="utf-8-sig"):
    with path.open("w", encoding=encoding, newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(headers)
        writer.writerows(rows)


class RouteNormalizationTests(unittest.TestCase):
    def test_normalizes_only_declared_route_number_variants(self):
        self.assertEqual(MODULE.normalize_route_number(" 055(통합) "), "55")
        self.assertEqual(MODULE.normalize_route_number("043(원당역)"), "43")
        self.assertEqual(MODULE.normalize_route_number("15-1(구파발)"), "15-1")
        self.assertEqual(MODULE.normalize_route_number("N001"), "N001")


class EvidenceBuilderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_headway_separates_unique_multiple_and_no_candidate(self):
        route_presence = self.root / "route_presence.csv"
        write_csv(
            route_presence,
            ["routeName", "servingStopCount", "routeMentionCount"],
            [["011", 4, 4], ["055", 5, 5], ["043(원당역)", 2, 2], ["15A", 3, 3]],
        )
        headway = self.root / "headway.csv"
        write_csv(
            headway,
            ["순번", "관할관청", "운행업체", "노선번호", "기점", "종점", "배차간격"],
            [
                [1, "고양시", "업체A", "11", "기점A", "종점A", "10~12"],
                [2, "고양시", "업체B", "11", "기점B", "종점B", "20~25"],
                [3, "고양시", "업체C", "055(통합)", "기점C", "종점C", "30"],
                [4, "고양시", "업체D", "43", "기점D", "종점D", "15"],
            ],
            encoding="cp949",
        )

        rows, review, summary = MODULE.build_headway_matches(route_presence, headway)

        self.assertEqual(summary["routeDenominator"], 4)
        self.assertEqual(summary["routeNumberCandidateCoverage"], 3)
        self.assertEqual(summary["matchedUnique"], 2)
        self.assertEqual(summary["matchedMultipleCandidates"], 1)
        self.assertEqual(summary["unresolvedNoCandidate"], 1)
        by_route = {row["routeName"]: row for row in rows}
        self.assertEqual(by_route["011"]["matchStatus"], "matched_multiple_candidates")
        self.assertEqual(by_route["15A"]["matchStatus"], "unresolved_no_candidate")
        self.assertEqual(len(review), 2)

    def test_bms_link_requires_unique_positive_station_overlap(self):
        bus_stops = self.root / "bus_stops.csv"
        write_csv(
            bus_stops,
            ["stop_id", "stop_name", "routes_raw", "latitude", "longitude", "dong_name", "district_name"],
            [
                ["S1", "정류장1", "011(마을)", "37.1", "126.1", "행주동", "덕양구"],
                ["S2", "정류장2", "011(마을), 15A(마을)", "37.2", "126.2", "행주동", "덕양구"],
            ],
        )
        route_map = self.root / "route_map.csv"
        write_csv(
            route_map,
            ["업체ID", "노선ID", "노선명"],
            [["A1", "R1", "11"], ["A2", "R2", "11"], ["A3", "R3", "15A"]],
            encoding="cp949",
        )
        stop_order_zip = self.root / "stop_order.zip"
        content = io_string(
            ["ROUTE_ID", "STTN_ORDR", "STTN_ID", "PROGRS_DIV_CD_NM"],
            [["R1", 1, "S1", "상행"], ["R1", 2, "S2", "상행"], ["R2", 1, "OTHER", "상행"], ["R3", 1, "OTHER2", "상행"]],
        ).encode("cp949")
        with zipfile.ZipFile(stop_order_zip, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("stop_order.csv", content)

        linkage, points, summary = MODULE.build_bms_linkage(
            ["011", "15A"], bus_stops, route_map, stop_order_zip
        )

        by_route = {row["routeName"]: row for row in linkage}
        self.assertEqual(by_route["011"]["linkStatus"], "linked_unique_route_id")
        self.assertEqual(by_route["15A"]["linkStatus"], "unresolved_no_station_overlap")
        self.assertEqual(summary["linkedUniqueRouteId"], 1)
        self.assertEqual(len(points), 2)
        self.assertEqual(summary["linkedUniqueCoordinateLocations"], 2)
        self.assertNotIn("selectedRouteId", by_route["011"])
        self.assertNotIn("routeId", points[0])
        self.assertNotIn("stopId", points[0])
        self.assertNotIn("stopName", points[0])

    def test_raw_preservation_never_overwrites_different_bytes(self):
        original, first_hash, first_action = FETCH_MODULE.preserve_raw(
            self.root, "source.csv", b"first"
        )
        versioned, second_hash, second_action = FETCH_MODULE.preserve_raw(
            self.root, "source.csv", b"second"
        )
        self.assertEqual(first_action, "created")
        self.assertEqual(second_action, "created_version_without_overwrite")
        self.assertEqual(original.read_bytes(), b"first")
        self.assertEqual(versioned.read_bytes(), b"second")
        self.assertNotEqual(first_hash, second_hash)


class PublishedArtifactContractTests(unittest.TestCase):
    def test_published_summary_keeps_evidence_boundaries(self):
        output_dir = Path(__file__).resolve().parents[1] / "outputs" / "tables" / "bus_network_evidence"
        summary = json.loads((output_dir / "analysis_summary.json").read_text(encoding="utf-8"))
        self.assertEqual(summary["headway"]["routeDenominator"], 86)
        self.assertEqual(summary["headway"]["routeNumberCandidateCoverage"], 82)
        self.assertEqual(summary["headway"]["matchedUnique"], 72)
        self.assertEqual(summary["headway"]["matchedMultipleCandidates"], 10)
        self.assertEqual(summary["headway"]["unresolvedNoCandidate"], 4)
        self.assertEqual(summary["bms"]["bmsStopOrderRows"], 482779)
        self.assertEqual(summary["interpretationBoundary"]["actualTargetPopulation"], "not_acquired")
        with (output_dir / "headway_unresolved_no_candidate.csv").open(
            encoding="utf-8-sig", newline=""
        ) as stream:
            unresolved = {row["routeName"] for row in csv.DictReader(stream)}
        self.assertEqual(unresolved, {"15-1(구파발)", "15-1(지축)", "15A", "15B"})


def io_string(headers, rows):
    import io

    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(headers)
    writer.writerows(rows)
    return stream.getvalue()


if __name__ == "__main__":
    unittest.main()
