import torch

from riskgpu.board import Board


def test_board():
    b = Board.load("cpu")
    assert b.edges.shape == (166, 2)
    assert bool((b.adjacency == b.adjacency.T).all())
    assert int(b.adjacency.sum()) == 166
    assert b.continent_members.sum(1).tolist() == [9, 4, 7, 6, 12, 4]
    expected = [[t, int(n)] for t in range(42) for n in b.adjacent[t] if n >= 0]
    assert b.edges.tolist() == expected
    for k, (x, y) in enumerate(b.edges.tolist()):
        assert int(b.edge_id[x, y]) == k
    assert int((b.edge_id >= 0).sum()) == 166
    assert b.card_symbol[42:].tolist() == [-1, -1] and b.card_territory[42:].tolist() == [-1, -1]
    assert bool((b.card_symbol[:42] >= 0).all())
    assert sorted(b.gd_order.tolist()) == list(range(42))
    gd = b.gd_links
    for t in range(42):
        assert sorted(int(n) for n in gd[t] if n >= 0) == sorted(int(n) for n in b.adjacent[t] if n >= 0)
    assert b.starting_armies.tolist() == [0, 0, 0, 35, 30, 25, 20]
    assert b.first_turn_bonus[6].tolist() == [0, 0, 0, 1, 2, 3]
    assert b.continent_bonus.dtype == torch.int32
