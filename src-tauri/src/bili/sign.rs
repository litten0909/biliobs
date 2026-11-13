use md5::{Digest, Md5};

/// B站 APP 接口签名：参数按 key 排序、URL 编码后拼接，末尾追加 appsec 取 MD5。
/// 返回带 `sign` 字段的完整参数列表。
pub fn app_sign(mut params: Vec<(String, String)>, appsec: &str) -> Vec<(String, String)> {
    params.sort_by(|a, b| a.0.cmp(&b.0));
    let query = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(params.iter())
        .finish();
    let mut hasher = Md5::new();
    hasher.update(query.as_bytes());
    hasher.update(appsec.as_bytes());
    let sign = hex(&hasher.finalize());
    params.push(("sign".into(), sign));
    params
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pairs(items: &[(&str, &str)]) -> Vec<(String, String)> {
        items
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    /// bilibili-API-collect 文档中给出的签名示例。
    #[test]
    fn matches_documented_example() {
        let signed = app_sign(
            pairs(&[
                ("id", "114514"),
                ("str", "1919810"),
                ("test", "いいよ，こいよ"),
                ("appkey", "1d8b6e7d45233436"),
            ]),
            "560c52ccd288fed045859ed18bffd973",
        );
        let sign = &signed.last().unwrap().1;
        assert_eq!(sign, "01479cf20504d865519ac50f33ba3a7d");
    }

    #[test]
    fn sorts_params_before_signing() {
        let a = app_sign(pairs(&[("b", "2"), ("a", "1")]), "sec");
        let b = app_sign(pairs(&[("a", "1"), ("b", "2")]), "sec");
        assert_eq!(a, b);
        assert_eq!(a[0].0, "a");
    }
}
