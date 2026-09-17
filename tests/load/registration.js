import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const errors = new Rate("registration_errors");
const completed = new Counter("registrations_completed");
const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:3000";

export const options = {
  scenarios: {
    venue_arrival: {
      executor: "shared-iterations",
      vus: 100,
      iterations: 500,
      maxDuration: "5m",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1000"],
    registration_errors: ["rate<0.01"],
    registrations_completed: ["count==500"],
  },
};

export default function registerGuest() {
  const sequence = __ITER + __VU * 10000;
  const suffix = String(sequence % 10000).padStart(4, "0");
  const payload = JSON.stringify({
    name: `负载宾客${__VU}-${__ITER}`,
    phoneLast4: suffix,
    relation: ["GROOM_FRIEND", "BRIDE_FRIEND", "MUTUAL_FRIEND", "COLLEAGUE"][sequence % 4],
    childCount: sequence % 7 === 0 ? 1 : 0,
    originProvince: sequence % 5 === 0 ? "广东" : "北京",
    originCity: sequence % 5 === 0 ? "深圳市" : "北京市",
  });
  const response = http.post(`${baseUrl}/api/registration`, payload, {
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      "Idempotency-Key": `k6-${__VU}-${__ITER}`,
    },
  });
  const succeeded = check(response, { "registration returns 200": (result) => result.status === 200 });
  errors.add(!succeeded);
  if (succeeded) completed.add(1);
  sleep(0.05);
}
