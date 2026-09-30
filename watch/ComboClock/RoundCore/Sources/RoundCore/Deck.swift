import Foundation

/// A true/false question. Two answers is what fits under a thumb on a 41mm
/// screen; every card carries a teach line, so a miss still reveals a fact.
public struct Card: Sendable, Equatable, Identifiable {
    public let id: Int
    public let prompt: String
    public let answer: Bool
    public let teach: String

    public init(id: Int, prompt: String, answer: Bool, teach: String) {
        self.id = id; self.prompt = prompt; self.answer = answer; self.teach = teach
    }
}

public enum Deck {
    /// Narrative facts inside the shared 66-book canon — no doctrine, nothing
    /// one tradition would answer differently (same rule as the web trivia).
    public static let cards: [Card] = [
        Card(id: 1, prompt: "Jonah was swallowed by a great fish.", answer: true,
             teach: "Jonah 1:17 — three days and three nights inside it."),
        Card(id: 2, prompt: "David was the eldest of Jesse's sons.", answer: false,
             teach: "He was the youngest, out keeping the sheep (1 Samuel 16:11)."),
        Card(id: 3, prompt: "Moses led Israel across the Jordan into Canaan.", answer: false,
             teach: "Joshua did (Joshua 3). Moses saw the land from Mount Nebo."),
        Card(id: 4, prompt: "Paul was from Tarsus.", answer: true,
             teach: "\"A Jew of Tarsus in Cilicia\" (Acts 21:39)."),
        Card(id: 5, prompt: "The Sermon on the Mount is recorded in Matthew.", answer: true,
             teach: "Matthew 5–7."),
        Card(id: 6, prompt: "Ruth came from Moab.", answer: true,
             teach: "Ruth the Moabitess (Ruth 1:4)."),
        Card(id: 7, prompt: "Noah sent out only a dove from the ark.", answer: false,
             teach: "A raven first, then the dove (Genesis 8:7–8)."),
        Card(id: 8, prompt: "Zacchaeus climbed a tree to see Jesus.", answer: true,
             teach: "He was short, so he climbed a sycamore (Luke 19:4)."),
        Card(id: 9, prompt: "Esther was queen of Egypt.", answer: false,
             teach: "Of Persia, wife of King Ahasuerus (Esther 2:17)."),
        Card(id: 10, prompt: "Peter denied Jesus three times.", answer: true,
             teach: "Before the rooster crowed (Luke 22:61)."),
        Card(id: 11, prompt: "Israel marched around Jericho for seven days.", answer: true,
             teach: "Seven times on the seventh day, then the walls fell (Joshua 6)."),
        Card(id: 12, prompt: "Daniel was thrown into a den of bears.", answer: false,
             teach: "Lions — and they did not touch him (Daniel 6)."),
        Card(id: 13, prompt: "Abraham's wife was named Rebekah.", answer: false,
             teach: "Sarah. Rebekah married their son Isaac (Genesis 24)."),
        Card(id: 14, prompt: "Lazarus was the brother of Mary and Martha.", answer: true,
             teach: "Of Bethany (John 11:1–2)."),
        Card(id: 15, prompt: "Jesus turned water into wine at a wedding in Cana.", answer: true,
             teach: "His first sign (John 2:11)."),
        Card(id: 16, prompt: "Goliath was from the city of Gath.", answer: true,
             teach: "\"Goliath of Gath\" (1 Samuel 17:4)."),
    ]

    public static func draw<G: RandomNumberGenerator>(_ count: Int, using rng: inout G) -> [Card] {
        Array(cards.shuffled(using: &rng).prefix(count))
    }
}
